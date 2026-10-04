/** Board background colors offered in the UI (Trello-like palette). */
export const BOARD_COLORS = [
  { value: "#0079bf", name: "Blu" },
  { value: "#d29034", name: "Arancione" },
  { value: "#519839", name: "Verde" },
  { value: "#b04632", name: "Rosso" },
  { value: "#89609e", name: "Viola" },
  { value: "#cd5a91", name: "Rosa" },
  { value: "#4bbf6b", name: "Lime" },
  { value: "#00aecc", name: "Azzurro" },
  { value: "#838c91", name: "Grigio" },
] as const;

export const DEFAULT_BOARD_COLOR = BOARD_COLORS[0].value;

export const BOARD_COLOR_VALUES = BOARD_COLORS.map((color) => color.value) as [string, ...string[]];
