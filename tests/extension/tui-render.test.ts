import { describe, expect, test } from "vitest";
import { renderFrameCall, renderFrameResult } from "../../extensions/tui-render.js";

const theme = {
  fg: (_key: string, text: string) => text,
  bg: (_key: string, text: string) => text,
  bold: (text: string) => text,
};

describe("tui render helpers", () => {
  test("result rendering does not invalidate during render (avoids doubled rows)", () => {
    let invalidations = 0;
    const context = { args: { action: "status" }, state: {}, invalidate: () => { invalidations += 1; } };
    const result = renderFrameResult(theme, context, "Summary", ["body"], { status: "success" });
    expect(result.render(120)).toEqual(["  ⎿  Summary", "     body"]);
    expect(invalidations).toBe(0);
  });

  test("call header reflects final status after result marks the shared state", () => {
    const context = { args: { action: "status" }, state: {}, invalidate() {} };
    const call = renderFrameCall(theme, context, "Project", "status");
    expect(call.render(120)[0]).toBe("● Project(status)");
    renderFrameResult(theme, context, "Done", [], { status: "warning" }).render(120);
    expect(call.render(120)[0]).toBe("● Project(status)");
  });
});
