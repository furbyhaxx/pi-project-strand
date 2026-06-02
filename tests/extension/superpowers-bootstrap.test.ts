import { describe, expect, test } from "vitest";
import { buildProjectStrandBootstrap } from "../../extensions/superpowers-bootstrap.js";

describe("buildProjectStrandBootstrap", () => {
  test("prioritizes user instructions over project-strand rules", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("User instructions override project-strand guidance");
  });

  test("requires skill-first behavior before action", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("If even a 1% chance a skill applies");
    expect(text).toContain("before any response or action");
  });

  test("mentions both trackers and delegate-driven teammates", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("plan_tracker");
    expect(text).toContain("project_tracker");
    expect(text).toContain("delegate");
  });

  test("describes PROJECT.md as the planned capability map", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("high-level planned features/capabilities");
  });
});
