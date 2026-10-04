import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { positionsFor } from "../src/lib/position";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SEED_BOARD_TITLE = "Board di esempio";

async function main() {
  const existing = await db.board.findFirst({ where: { title: SEED_BOARD_TITLE } });
  if (existing) {
    console.log(`Seed skipped: "${SEED_BOARD_TITLE}" already exists.`);
    return;
  }

  const [boardPos] = positionsFor(1);
  const board = await db.board.create({
    data: {
      title: SEED_BOARD_TITLE,
      color: "#0079bf",
      position: boardPos,
      labels: {
        create: [
          { name: "Urgente", color: "#eb5a46" },
          { name: "Lavoro", color: "#0079bf" },
          { name: "Personale", color: "#61bd4f" },
        ],
      },
    },
    include: { labels: true },
  });

  const lists: { title: string; cards: string[] }[] = [
    { title: "Da fare", cards: ["Pianificare la settimana", "Rinnovare abbonamento palestra"] },
    { title: "In corso", cards: ["Preparare presentazione"] },
    { title: "Fatto", cards: ["Configurare RDL Productivity"] },
  ];
  const listPositions = positionsFor(lists.length);
  const [urgent, work, personal] = board.labels;

  for (const [i, list] of lists.entries()) {
    const cardPositions = positionsFor(list.cards.length);
    await db.list.create({
      data: {
        boardId: board.id,
        title: list.title,
        position: listPositions[i],
        cards: {
          create: list.cards.map((title, j) => ({ title, position: cardPositions[j] })),
        },
      },
    });
  }

  const presentation = await db.card.findFirstOrThrow({
    where: { title: "Preparare presentazione", list: { boardId: board.id } },
  });
  const [checklistPos] = positionsFor(1);
  const itemPositions = positionsFor(3);
  await db.card.update({
    where: { id: presentation.id },
    data: {
      description: "Slide per la riunione di **venerdì**.",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      labels: { create: [{ labelId: urgent.id }, { labelId: work.id }] },
      checklists: {
        create: {
          title: "Passi",
          position: checklistPos,
          items: {
            create: ["Raccogliere i dati", "Bozza delle slide", "Prova generale"].map(
              (text, k) => ({ text, position: itemPositions[k], done: k === 0 }),
            ),
          },
        },
      },
    },
  });

  const gym = await db.card.findFirstOrThrow({
    where: { title: "Rinnovare abbonamento palestra", list: { boardId: board.id } },
  });
  await db.cardLabel.create({ data: { cardId: gym.id, labelId: personal.id } });

  console.log(`Seeded board "${board.title}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
