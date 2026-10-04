import { describe, expect, it } from "vitest";

import { BOARD_COLORS } from "./board-colors";
import { contrastRatio, LABEL_COLORS, labelTextColor } from "./label-colors";

describe("color contrast", () => {
  it("keeps white text readable on every board color (WCAG AA)", () => {
    for (const color of BOARD_COLORS) {
      expect(contrastRatio(color.value, "#ffffff"), color.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("picks a readable text color for every label color (WCAG AA)", () => {
    for (const color of LABEL_COLORS) {
      const text = labelTextColor(color.value);
      expect(contrastRatio(color.value, text), color.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses dark text on light labels", () => {
    expect(labelTextColor("#f2d600")).not.toBe("#ffffff");
    expect(labelTextColor("#344563")).toBe("#ffffff");
  });
});
