import { describe, expect, it } from "vitest";
import { newMemeId, SituationSchema } from "../src/domain.js";

describe("SituationSchema", () => {
  it("rejects blank and over-long input", () => {
    expect(SituationSchema.safeParse("  ").success).toBe(false);
    expect(SituationSchema.safeParse("x".repeat(281)).success).toBe(false);
  });

  it("accepts a normal situation", () => {
    expect(SituationSchema.parse("when the standup could have been an email")).toBe(
      "when the standup could have been an email",
    );
  });
});

describe("newMemeId", () => {
  it("is a 10-char URL-safe id and unique across 1000 calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newMemeId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });
});
