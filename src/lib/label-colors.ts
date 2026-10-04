/** Label colors offered in the UI (Trello-like palette). */
export const LABEL_COLORS = [
  { value: "#61bd4f", name: "Verde" },
  { value: "#f2d600", name: "Giallo" },
  { value: "#ff9f1a", name: "Arancione" },
  { value: "#eb5a46", name: "Rosso" },
  { value: "#c377e0", name: "Viola" },
  { value: "#0079bf", name: "Blu" },
  { value: "#00c2e0", name: "Azzurro" },
  { value: "#51e898", name: "Lime" },
  { value: "#ff78cb", name: "Rosa" },
  { value: "#344563", name: "Nero" },
] as const;

export const LABEL_COLOR_VALUES = LABEL_COLORS.map((color) => color.value) as [string, ...string[]];

export function labelColorName(value: string) {
  return LABEL_COLORS.find((color) => color.value === value)?.name ?? value;
}
