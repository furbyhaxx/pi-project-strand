import { describe, expect, test } from "vitest";
import { buildSuperpowersBootstrap } from "../../extensions/superpowers-bootstrap.js";

describe("buildSuperpowersBootstrap", () => {
  test("prioritizes user instructions over superpowers rules", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("User instructions override superpowers guidance");
  });

  test("requires skill-first behavior before action", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("If even a 1% chance a skill applies");
    expect(text).toContain("before any response or action");
  });

  test("uses pi-native wording", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("/skill:");
    expect(text).toContain("AskUserQuestion");
    expect(text).not.toContain("Skill tool");
  });
});
