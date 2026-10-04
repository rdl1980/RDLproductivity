/**
 * Board background colors offered in the UI. Every color keeps white text at
 * WCAG AA contrast (≥ 4.5:1).
 */
export const BOARD_COLORS = [
  { value: "#0079bf", name: "Blu" },
  { value: "#9b6b26", name: "Ocra" },
  { value: "#468331", name: "Verde" },
  { value: "#b04632", name: "Rosso" },
  { value: "#89609e", name: "Viola" },
  { value: "#b85183", name: "Rosa" },
  { value: "#34844a", name: "Smeraldo" },
  { value: "#007f95", name: "Azzurro" },
  { value: "#6e767a", name: "Grigio" },
] as const;

export const DEFAULT_BOARD_COLOR = BOARD_COLORS[0].value;

export const BOARD_COLOR_VALUES = BOARD_COLORS.map((color) => color.value) as [string, ...string[]];
