import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { BOARD_COLORS, DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { LABEL_COLORS } from "@/lib/label-colors";
import { RECURRENCE_RULES } from "@/lib/recurrence";
import { restoreBoard, restoreList } from "@/server/actions/archive";
import { createBoard, updateBoard } from "@/server/actions/boards";
import {
  copyCard,
  moveCardToList,
  restoreCard,
  updateCardDetails,
} from "@/server/actions/card-details";
import { createCard, moveCard, updateCard } from "@/server/actions/cards";
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  renameChecklist,
  updateChecklistItem,
} from "@/server/actions/checklists";
import { createLabel, deleteLabel, setCardLabel, updateLabel } from "@/server/actions/labels";
import { createList, moveList, updateList } from "@/server/actions/lists";
import { type ActionResult, fail, ok } from "@/server/actions/result";
import { db } from "@/server/db";
import { runAsMcpUser } from "@/server/mcp-context";
import { listActivity, undoActivity, UndoError } from "@/server/activity";
import {
  createBoardFromTemplate,
  createCardFromTemplate,
  getTemplates,
  saveBoardAsTemplate,
  saveCardAsTemplate,
} from "@/server/actions/templates";
import { getSuperBoard } from "@/server/queries/aggregate";
import { getArchive } from "@/server/queries/archive";
import { getBoard, getBoards } from "@/server/queries/boards";
import { getCalendarCards } from "@/server/queries/calendar";
import { loadCardDetail } from "@/server/queries/card-detail";
import { searchCards } from "@/server/queries/search";

type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
};

/** The app is single-user: dates without a zone are read in the owner's. */
const DEFAULT_TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

const READ: ToolAnnotations = { readOnlyHint: true };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };
const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };

const id = (what: string) => z.string().min(1).max(64).describe(`ID of the ${what}`);
const isoDate = z.iso
  .datetime({ offset: true })
  .describe("ISO 8601 date-time with offset, e.g. 2026-10-05T09:00:00+02:00");
const nullableDate = isoDate.nullable().optional();
const priority = z
  .number()
  .int()
  .min(0)
  .max(4)
  .nullable()
  .optional()
  .describe("Priority from 0 (highest, P0) to 4 (lowest); null clears it");
const recurrence = z
  .object({
    rule: z.enum(RECURRENCE_RULES),
    interval: z.number().int().min(1).max(365).default(1),
    timeZone: z
      .string()
      .default(DEFAULT_TIME_ZONE)
      .describe(`IANA time zone of the due time, default ${DEFAULT_TIME_ZONE}`),
  })
  .nullable()
  .optional()
  .describe(
    "Repeat rule; requires a due date. Completing the card creates the next occurrence. null removes it",
  );
const index = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("0-based target position among the other items; omit to put it last");

function colorSchema(colors: readonly { value: string; name: string }[]) {
  const names = colors.map((color) => `${color.name} (${color.value})`).join(", ");
  return z
    .string()
    .transform((value, ctx) => {
      const match = colors.find(
        (color) =>
          color.value.toLowerCase() === value.trim().toLowerCase() ||
          color.name.toLowerCase() === value.trim().toLowerCase(),
      );
      if (!match) {
        ctx.addIssue({ code: "custom", message: `Unknown color. Use one of: ${names}` });
        return z.NEVER;
      }
      return match.value;
    })
    .describe(`Color name or hex: ${names}`);
}
const boardColor = colorSchema(BOARD_COLORS);
const labelColor = colorSchema(LABEL_COLORS);

function textResult(value: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
    isError,
  };
}

/**
 * Registers a tool whose body runs as the token's user, so the Server Actions'
 * auth checks pass. Failures become MCP tool errors the model can read.
 */
function defineTool<S extends z.ZodObject>(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: S; annotations: ToolAnnotations },
  run: (input: z.output<S>) => Promise<ActionResult<unknown>>,
) {
  // Erase the generic: the SDK's callback type only resolves for a concrete schema.
  const inputSchema: z.ZodObject = config.inputSchema;
  server.registerTool(name, { ...config, inputSchema }, async (input, ctx) => {
    const email = ctx.http?.authInfo?.extra?.email;
    if (typeof email !== "string") return textResult("Non autorizzato.", true);
    try {
      const result = await runAsMcpUser({ email }, () => run(input as z.output<S>));
      return result.ok ? textResult(result.data ?? { ok: true }) : textResult(result.error, true);
    } catch (error) {
      console.error(`MCP tool ${name} failed`, error);
      return textResult("Errore interno del server.", true);
    }
  });
}

/** Unwraps a chain of actions: the first failure wins. */
async function chain(...steps: (() => Promise<ActionResult<unknown>>)[]): Promise<ActionResult> {
  for (const step of steps) {
    const result = await step();
    if (!result.ok) return result;
  }
  return ok(undefined);
}

async function cardDetail(cardId: string) {
  const card = await loadCardDetail(cardId);
  if (!card) return fail("Card non trovata.");
  const { labelIds, ...rest } = card;
  return ok({
    ...rest,
    labels: card.board.labels.filter((label) => labelIds.includes(label.id)),
    board: { id: card.board.id, title: card.board.title },
  });
}

/** Neighbour IDs that place an item at `target` among `siblings` (which exclude it). */
function neighboursAt(siblings: { id: string }[], target: number | undefined) {
  const at = Math.min(target ?? siblings.length, siblings.length);
  return { beforeId: siblings[at - 1]?.id ?? null, afterId: siblings[at]?.id ?? null };
}

export function registerTools(server: McpServer) {
  // ---- Read ----

  defineTool(
    server,
    "list_boards",
    {
      title: "List boards",
      description: "Lists the active (non-archived) boards in display order.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => ok(await getBoards()),
  );

  defineTool(
    server,
    "get_board",
    {
      title: "Get board",
      description:
        "Returns a board with its labels and its active lists, each with its active cards in order " +
        "(title, due date, completed flag, label IDs, checklist progress).",
      inputSchema: z.object({ boardId: id("board") }),
      annotations: READ,
    },
    async ({ boardId }) => {
      const board = await getBoard(boardId);
      return board ? ok(board) : fail("Board non trovata.");
    },
  );

  defineTool(
    server,
    "get_card",
    {
      title: "Get card",
      description:
        "Returns a card's full details: description (markdown), dates, completed and archived flags, " +
        "list, board, labels and checklists with their items.",
      inputSchema: z.object({ cardId: id("card") }),
      annotations: READ,
    },
    ({ cardId }) => cardDetail(cardId),
  );

  defineTool(
    server,
    "search_cards",
    {
      title: "Search cards",
      description:
        "Case-insensitive search on card titles and descriptions across all active boards (max 50 results).",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200) }),
      annotations: READ,
    },
    async ({ query }) => ok(await searchCards(query)),
  );

  defineTool(
    server,
    "list_due_cards",
    {
      title: "List cards by due date",
      description:
        "Lists active cards whose due date falls between `from` and `to` (inclusive), " +
        "optionally filtered by board or label. Dates are returned in UTC.",
      inputSchema: z.object({
        from: isoDate,
        to: isoDate,
        boardId: id("board").optional(),
        labelId: id("label").optional(),
      }),
      annotations: READ,
    },
    async ({ from, to, boardId, labelId }) => {
      const start = new Date(from);
      const end = new Date(to);
      if (start > end) return fail("`from` deve precedere `to`.");
      return ok(await getCalendarCards({ from: start, to: end, boardId, labelId }));
    },
  );

  defineTool(
    server,
    "get_super_board",
    {
      title: "Get super board",
      description:
        "Returns every active card with priority P0 (expedite) or P1 across all boards, with its " +
        "board, list, labels and due date. Use it to answer what matters most right now.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => ok((await getSuperBoard()).cards),
  );

  defineTool(
    server,
    "list_activity",
    {
      title: "List activity",
      description:
        "Lists recent changes (newest first) made by the user or by Claude, optionally for one " +
        "card or board. Entries with undoable: true can be reverted with undo_activity.",
      inputSchema: z.object({
        cardId: id("card").optional(),
        boardId: id("board").optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      annotations: READ,
    },
    async ({ cardId, boardId, limit }) => ok(await listActivity({ cardId, boardId, take: limit })),
  );

  defineTool(
    server,
    "undo_activity",
    {
      title: "Undo activity",
      description:
        "Reverts one change from list_activity. Refused when a later change touched the same " +
        "records (undo that one first) or when the change cannot be undone (permanent deletions).",
      inputSchema: z.object({ activityId: id("activity entry") }),
      annotations: WRITE,
    },
    async ({ activityId }) => {
      try {
        return ok(await undoActivity(activityId));
      } catch (error) {
        if (error instanceof UndoError) return fail(error.message);
        throw error;
      }
    },
  );

  // ---- Templates ----

  defineTool(
    server,
    "list_templates",
    {
      title: "List templates",
      description: "Lists saved board and card templates (id, kind, name, short description).",
      inputSchema: z.object({ kind: z.enum(["board", "card"]).optional() }),
      annotations: READ,
    },
    ({ kind }) => getTemplates(kind),
  );

  defineTool(
    server,
    "save_board_as_template",
    {
      title: "Save board as template",
      description:
        "Saves a board's lists and labels (and optionally its cards) as a reusable template.",
      inputSchema: z.object({
        boardId: id("board"),
        name: z.string(),
        includeCards: z.boolean().default(false),
      }),
      annotations: WRITE,
    },
    (input) => saveBoardAsTemplate(input),
  );

  defineTool(
    server,
    "save_card_as_template",
    {
      title: "Save card as template",
      description:
        "Saves a card's title, description, priority, labels and checklists as a reusable template.",
      inputSchema: z.object({ cardId: id("card"), name: z.string() }),
      annotations: WRITE,
    },
    (input) => saveCardAsTemplate(input),
  );

  defineTool(
    server,
    "create_board_from_template",
    {
      title: "Create board from template",
      description: "Creates a new board from a board template. Returns the new board id.",
      inputSchema: z.object({
        templateId: id("template"),
        title: z.string(),
        color: boardColor.optional(),
      }),
      annotations: WRITE,
    },
    (input) => createBoardFromTemplate(input),
  );

  defineTool(
    server,
    "create_card_from_template",
    {
      title: "Create card from template",
      description:
        "Adds a card from a card template at the bottom of a list; missing labels are created on " +
        "the list's board. Returns the card.",
      inputSchema: z.object({ templateId: id("template"), listId: id("list") }),
      annotations: WRITE,
    },
    async (input) => {
      const created = await createCardFromTemplate(input);
      return created.ok ? cardDetail(created.data.card.id) : created;
    },
  );

  defineTool(
    server,
    "list_archived",
    {
      title: "List archived items",
      description: "Lists archived boards, lists and cards (most recent first).",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => ok(await getArchive()),
  );

  // ---- Boards and lists ----

  defineTool(
    server,
    "create_board",
    {
      title: "Create board",
      description: "Creates a board at the end of the board list.",
      inputSchema: z.object({ title: z.string(), color: boardColor.optional() }),
      annotations: WRITE,
    },
    ({ title, color }) => createBoard({ title, color: color ?? DEFAULT_BOARD_COLOR }),
  );

  defineTool(
    server,
    "update_board",
    {
      title: "Update board",
      description: "Renames, recolors, archives (archived: true) or restores a board.",
      inputSchema: z.object({
        boardId: id("board"),
        title: z.string().optional(),
        color: boardColor.optional(),
        archived: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    ({ boardId, ...changes }) => updateBoard({ id: boardId, ...changes }),
  );

  defineTool(
    server,
    "create_list",
    {
      title: "Create list",
      description: "Adds a list at the end of a board.",
      inputSchema: z.object({ boardId: id("board"), title: z.string() }),
      annotations: WRITE,
    },
    ({ boardId, title }) => createList({ boardId, title }),
  );

  defineTool(
    server,
    "update_list",
    {
      title: "Update list",
      description: "Renames, archives (archived: true) or restores a list.",
      inputSchema: z.object({
        listId: id("list"),
        title: z.string().optional(),
        archived: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    ({ listId, ...changes }) => updateList({ id: listId, ...changes }),
  );

  defineTool(
    server,
    "move_list",
    {
      title: "Move list",
      description: "Reorders a list within its board.",
      inputSchema: z.object({ listId: id("list"), index }),
      annotations: WRITE,
    },
    async ({ listId, index: target }) => {
      const list = await db.list.findUnique({ where: { id: listId }, select: { boardId: true } });
      if (!list) return fail("Lista non trovata.");
      const siblings = await db.list.findMany({
        where: { boardId: list.boardId, archived: false, id: { not: listId } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      return moveList({ id: listId, ...neighboursAt(siblings, target) });
    },
  );

  // ---- Cards ----

  defineTool(
    server,
    "create_card",
    {
      title: "Create card",
      description:
        "Adds a card at the bottom of a list, optionally with description (markdown), dates, priority and labels " +
        "(label IDs from the same board). Returns the created card.",
      inputSchema: z.object({
        listId: id("list"),
        title: z.string(),
        description: z.string().optional(),
        startDate: nullableDate,
        dueDate: nullableDate,
        priority,
        recurrence,
        labelIds: z.array(id("label")).max(20).optional(),
      }),
      annotations: WRITE,
    },
    async ({
      listId,
      title,
      description,
      startDate,
      dueDate,
      priority: level,
      recurrence: repeat,
      labelIds,
    }) => {
      const created = await createCard({ listId, title });
      if (!created.ok) return created;
      const cardId = created.data.id;
      const result = await chain(
        () =>
          description !== undefined || startDate || dueDate || level != null || repeat
            ? updateCardDetails({
                id: cardId,
                description,
                startDate,
                dueDate,
                priority: level,
                recurrence: repeat,
              })
            : Promise.resolve(ok(undefined)),
        ...(labelIds ?? []).map(
          (labelId) => () => setCardLabel({ cardId, labelId, assigned: true }),
        ),
      );
      if (!result.ok) return fail(`Card creata (${cardId}), ma: ${result.error}`);
      return cardDetail(cardId);
    },
  );

  defineTool(
    server,
    "update_card",
    {
      title: "Update card",
      description:
        "Updates a card: title, description (markdown; empty string clears it), start and due dates " +
        "(null clears), completed flag, priority (0-4, null clears), repeat rule, archived flag. " +
        "Only the given fields change. Completing a recurring card creates its next occurrence, " +
        "returned as nextOccurrence. Returns the card.",
      inputSchema: z.object({
        cardId: id("card"),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        startDate: nullableDate,
        dueDate: nullableDate,
        completed: z.boolean().optional(),
        priority,
        recurrence,
        archived: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    async ({
      cardId,
      title,
      archived,
      description,
      startDate,
      dueDate,
      completed,
      priority: level,
      recurrence: repeat,
    }) => {
      const renamed =
        title !== undefined || archived !== undefined
          ? await updateCard({ id: cardId, title, archived })
          : ok(undefined);
      if (!renamed.ok) return renamed;
      let nextOccurrence: string | null = null;
      if (
        [description, startDate, dueDate, completed, level, repeat].some((v) => v !== undefined)
      ) {
        const updated = await updateCardDetails({
          id: cardId,
          description,
          startDate,
          dueDate,
          completed,
          priority: level,
          recurrence: repeat,
        });
        if (!updated.ok) return updated;
        nextOccurrence = updated.data.next?.card.id ?? null;
      }
      const detail = await cardDetail(cardId);
      return detail.ok && nextOccurrence ? ok({ ...detail.data, nextOccurrence }) : detail;
    },
  );

  defineTool(
    server,
    "move_card",
    {
      title: "Move card",
      description:
        "Moves a card to a list (also on another board) at the given position. " +
        "Moving to another board removes its labels, which belong to the original board.",
      inputSchema: z.object({ cardId: id("card"), listId: id("list"), index }),
      annotations: WRITE,
    },
    async ({ cardId, listId, index: target }) => {
      const [card, list] = await Promise.all([
        db.card.findUnique({
          where: { id: cardId },
          select: { list: { select: { boardId: true } } },
        }),
        db.list.findUnique({ where: { id: listId }, select: { boardId: true } }),
      ]);
      if (!card || !list) return fail("Card o lista non trovata.");
      if (card.list.boardId !== list.boardId) {
        const moved = await moveCardToList({ id: cardId, listId, placement: "bottom" });
        if (!moved.ok || target === undefined) return moved.ok ? cardDetail(cardId) : moved;
      }
      const siblings = await db.card.findMany({
        where: { listId, archived: false, id: { not: cardId } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const moved = await moveCard({ id: cardId, listId, ...neighboursAt(siblings, target) });
      return moved.ok ? cardDetail(cardId) : moved;
    },
  );

  defineTool(
    server,
    "copy_card",
    {
      title: "Copy card",
      description:
        "Copies a card to the bottom of a list, with description, dates and optionally labels " +
        "(same board only) and checklists.",
      inputSchema: z.object({
        cardId: id("card"),
        listId: id("list"),
        title: z.string().optional().describe("Defaults to the original title"),
        keepLabels: z.boolean().default(true),
        keepChecklists: z.boolean().default(true),
      }),
      annotations: WRITE,
    },
    async ({ cardId, listId, title, keepLabels, keepChecklists }) => {
      const source = await db.card.findUnique({ where: { id: cardId }, select: { title: true } });
      if (!source) return fail("Card non trovata.");
      const copied = await copyCard({
        id: cardId,
        listId,
        title: title ?? source.title,
        placement: "bottom",
        keepLabels,
        keepChecklists,
      });
      return copied.ok ? cardDetail(copied.data.card.id) : copied;
    },
  );

  defineTool(
    server,
    "restore",
    {
      title: "Restore archived item",
      description:
        "Restores an archived board, list or card (restoring a card also restores its list and board).",
      inputSchema: z.object({ type: z.enum(["board", "list", "card"]), id: id("item") }),
      annotations: WRITE,
    },
    ({ type, id: itemId }) =>
      type === "board"
        ? restoreBoard(itemId)
        : type === "list"
          ? restoreList(itemId)
          : restoreCard(itemId),
  );

  // ---- Labels ----

  defineTool(
    server,
    "create_label",
    {
      title: "Create label",
      description: "Creates a label on a board.",
      inputSchema: z.object({ boardId: id("board"), name: z.string(), color: labelColor }),
      annotations: WRITE,
    },
    ({ boardId, name, color }) => createLabel({ boardId, name, color }),
  );

  defineTool(
    server,
    "update_label",
    {
      title: "Update label",
      description: "Renames or recolors a label.",
      inputSchema: z.object({
        labelId: id("label"),
        name: z.string().optional(),
        color: labelColor.optional(),
      }),
      annotations: WRITE,
    },
    ({ labelId, ...changes }) => updateLabel({ id: labelId, ...changes }),
  );

  defineTool(
    server,
    "delete_label",
    {
      title: "Delete label",
      description: "Deletes a label and removes it from every card.",
      inputSchema: z.object({ labelId: id("label") }),
      annotations: DELETE,
    },
    ({ labelId }) => deleteLabel(labelId),
  );

  defineTool(
    server,
    "set_card_label",
    {
      title: "Add or remove a card label",
      description: "Adds (assigned: true) or removes (assigned: false) a board label on a card.",
      inputSchema: z.object({ cardId: id("card"), labelId: id("label"), assigned: z.boolean() }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    (input) => setCardLabel(input),
  );

  // ---- Checklists ----

  defineTool(
    server,
    "create_checklist",
    {
      title: "Create checklist",
      description: "Adds a checklist to a card, optionally with items. Returns the card.",
      inputSchema: z.object({
        cardId: id("card"),
        title: z.string(),
        items: z.array(z.string()).max(100).optional(),
      }),
      annotations: WRITE,
    },
    async ({ cardId, title, items }) => {
      const created = await createChecklist({ cardId, title });
      if (!created.ok) return created;
      // Sequential: each item is positioned after the previous one.
      const result = await chain(
        ...(items ?? []).map(
          (text) => () => createChecklistItem({ checklistId: created.data.id, text }),
        ),
      );
      return result.ok ? cardDetail(cardId) : result;
    },
  );

  defineTool(
    server,
    "rename_checklist",
    {
      title: "Rename checklist",
      description: "Renames a checklist.",
      inputSchema: z.object({ checklistId: id("checklist"), title: z.string() }),
      annotations: WRITE,
    },
    ({ checklistId, title }) => renameChecklist({ id: checklistId, title }),
  );

  defineTool(
    server,
    "delete_checklist",
    {
      title: "Delete checklist",
      description: "Deletes a checklist and its items.",
      inputSchema: z.object({ checklistId: id("checklist") }),
      annotations: DELETE,
    },
    ({ checklistId }) => deleteChecklist(checklistId),
  );

  defineTool(
    server,
    "add_checklist_item",
    {
      title: "Add checklist item",
      description: "Appends an item to a checklist.",
      inputSchema: z.object({ checklistId: id("checklist"), text: z.string() }),
      annotations: WRITE,
    },
    ({ checklistId, text }) => createChecklistItem({ checklistId, text }),
  );

  defineTool(
    server,
    "update_checklist_item",
    {
      title: "Update checklist item",
      description: "Edits an item's text and/or marks it done or not done.",
      inputSchema: z.object({
        itemId: id("checklist item"),
        text: z.string().optional(),
        done: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    ({ itemId, ...changes }) => updateChecklistItem({ id: itemId, ...changes }),
  );

  defineTool(
    server,
    "delete_checklist_item",
    {
      title: "Delete checklist item",
      description: "Deletes a checklist item.",
      inputSchema: z.object({ itemId: id("checklist item") }),
      annotations: DELETE,
    },
    ({ itemId }) => deleteChecklistItem(itemId),
  );
}
