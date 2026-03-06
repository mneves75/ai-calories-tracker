import { describe, expect, it } from "bun:test";
import { evaluateAuthStress, parseAttemptsCsv } from "./verify-production-auth-gate.mjs";

describe("verify production auth gate", () => {
  it("passes with mixed 401/429 and valid Retry-After on 429", () => {
    const result = evaluateAuthStress([
      { code: 401, retryAfter: "" },
      { code: 401, retryAfter: "" },
      { code: 429, retryAfter: "53" },
      { code: 429, retryAfter: "52" },
      { code: 401, retryAfter: "" },
    ]);

    expect(result.ok).toBeTrue();
    expect(result.retryAfter).toBe(53);
    expect(result.summary).toContain("401=3");
    expect(result.summary).toContain("429=2");
  });

  it("fails when no 429 is observed", () => {
    const result = evaluateAuthStress([
      { code: 401, retryAfter: "" },
      { code: 401, retryAfter: "" },
    ]);

    expect(result.ok).toBeFalse();
    expect(result.errors.join(" ")).toContain("nenhuma resposta 429");
  });

  it("fails when no 401 is observed", () => {
    const result = evaluateAuthStress([
      { code: 429, retryAfter: "10" },
      { code: 429, retryAfter: "9" },
    ]);

    expect(result.ok).toBeFalse();
    expect(result.errors.join(" ")).toContain("nenhuma resposta 401");
  });

  it("fails when unexpected status codes exist", () => {
    const result = evaluateAuthStress([
      { code: 401, retryAfter: "" },
      { code: 500, retryAfter: "" },
      { code: 429, retryAfter: "20" },
    ]);

    expect(result.ok).toBeFalse();
    expect(result.errors.join(" ")).toContain("respostas inesperadas");
  });

  it("fails when 429 exists but Retry-After is missing/invalid", () => {
    const result = evaluateAuthStress([
      { code: 401, retryAfter: "" },
      { code: 429, retryAfter: "" },
      { code: 429, retryAfter: "abc" },
    ]);

    expect(result.ok).toBeFalse();
    expect(result.errors.join(" ")).toContain("Retry-After válido");
  });

  it("parses attempts csv", () => {
    const attempts = parseAttemptsCsv("401,\n429,15\n429,\n");
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual({ code: "401", retryAfter: "" });
    expect(attempts[1]).toEqual({ code: "429", retryAfter: "15" });
  });
});
