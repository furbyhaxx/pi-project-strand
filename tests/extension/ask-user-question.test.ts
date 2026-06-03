import { describe, test, expect } from "vitest";
import { boxLayoutWidth } from "../../extensions/ask-user-question.js";

// Regression: a desktop→mobile SSH resize shrank the terminal to 28 columns
// while the ask_user_question dialog was open. The box was laid out at a fixed
// minimum of 40 columns, so every rendered line exceeded the terminal width and
// pi-tui crashed with "Rendered line exceeds terminal width (40 > 28)".
describe("boxLayoutWidth", () => {
  test("never exceeds the terminal width (pi-tui contract)", () => {
    for (const w of [1, 5, 10, 20, 28, 39, 40, 80, 120, 200]) {
      expect(boxLayoutWidth(w)).toBeLessThanOrEqual(w);
    }
  });

  test("preserves the full width on normal terminals", () => {
    expect(boxLayoutWidth(80)).toBe(80);
    expect(boxLayoutWidth(40)).toBe(40);
  });

  test("guards against degenerate zero/negative widths", () => {
    expect(boxLayoutWidth(0)).toBeGreaterThanOrEqual(1);
    expect(boxLayoutWidth(-5)).toBeGreaterThanOrEqual(1);
  });
});
