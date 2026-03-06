import { describe, expect, it } from "bun:test";
import { getDateForTimezone } from "./local-date-by-timezone.mjs";

describe("local-date-by-timezone", () => {
  it("keeps localDate aligned with the user timezone around UTC midnight", () => {
    const now = new Date("2026-03-06T02:22:00.000Z");

    expect(getDateForTimezone("America/Sao_Paulo", now)).toBe("2026-03-05");
    expect(getDateForTimezone("UTC", now)).toBe("2026-03-06");
  });
});
