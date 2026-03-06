import { describe, expect, test } from "bun:test";
import { evaluateDoctorResult } from "./doctor-gate-lib.mjs";

const DUPLICATE_HEADER = `
Running 16 checks on your project...
15/16 checks passed. 1 checks failed. Possible issues detected:
✖ Check that no duplicate dependencies are installed
Your project contains duplicate native module dependencies, which should be de-duplicated.
`;

describe("evaluateDoctorResult", () => {
  test("passes through successful doctor result", () => {
    const result = evaluateDoctorResult({ status: 0, output: "all good\n" });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("all good");
  });

  test("fails if error is not duplicate-dependency related", () => {
    const result = evaluateDoctorResult({ status: 1, output: "network failure\n" });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("other than duplicate native dependencies");
  });

  test("fails when duplicate marker exists without duplicate blocks", () => {
    const result = evaluateDoctorResult({ status: 1, output: DUPLICATE_HEADER });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("no duplicate package block was found");
  });

  test("fails for app config sync warning enabled", () => {
    const output = `${DUPLICATE_HEADER}\nCheck for app config fields that may not be synced in a non-CNG project`;
    const result = evaluateDoctorResult({ status: 1, output });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("app config sync check is unexpectedly enabled");
  });

  test("fails when duplicate path is not from Bun store", () => {
    const output = `${DUPLICATE_HEADER}
Found duplicates for expo:
  ├─ expo@55.0.4 (at: node_modules/expo)
  └─ expo@55.0.4 (at: node_modules/expo-router/node_modules/expo)
  1 checks failed, indicating possible issues with the project.
`;
    const result = evaluateDoctorResult({ status: 1, output });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("does not reference Bun store paths");
  });

  test("fails when Bun duplicate block has version divergence", () => {
    const output = `${DUPLICATE_HEADER}
Found duplicates for expo:
  ├─ expo@55.0.4 (at: node_modules/expo)
  │  └─ linked to: ../../node_modules/.bun/expo@55.0.4+hash/node_modules/expo
  └─ expo@55.1.0 (at: ../../node_modules/.bun/expo-router@55.0.3+hash/node_modules/expo)
  1 checks failed, indicating possible issues with the project.
`;
    const result = evaluateDoctorResult({ status: 1, output });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("has multiple versions");
  });

  test("accepts Bun duplicate blocks with same version", () => {
    const output = `${DUPLICATE_HEADER}
Found duplicates for expo:
  ├─ expo@55.0.4 (at: node_modules/expo)
  │  └─ linked to: ../../node_modules/.bun/expo@55.0.4+hash/node_modules/expo
  └─ expo@55.0.4 (at: ../../node_modules/.bun/expo-router@55.0.3+hash/node_modules/expo)
     └─ linked to a different installation
Found duplicates for expo-constants:
  ├─ expo-constants@55.0.7 (at: node_modules/expo-constants)
  │  └─ linked to: ../../node_modules/.bun/expo-constants@55.0.7+hash/node_modules/expo-constants
  └─ expo-constants@55.0.7 (at: ../../node_modules/.bun/expo@55.0.4+hash/node_modules/expo-constants)
     └─ linked to a different installation
  1 checks failed, indicating possible issues with the project.
`;
    const result = evaluateDoctorResult({ status: 1, output });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Gate accepted");
  });
});
