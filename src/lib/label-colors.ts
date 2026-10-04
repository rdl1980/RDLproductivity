/** Label colors offered in the UI (Trello-like palette); see `labelTextColor`. */
export const LABEL_COLORS = [
  { value: "#61bd4f", name: "Verde" },
  { value: "#f2d600", name: "Giallo" },
  { value: "#ff9f1a", name: "Arancione" },
  { value: "#c9372c", name: "Rosso" },
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

const DARK_TEXT = "#172b4d";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** White or dark text, whichever reads better on `background`. */
export function labelTextColor(background: string) {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, DARK_TEXT)
    ? "#ffffff"
    : DARK_TEXT;
}
