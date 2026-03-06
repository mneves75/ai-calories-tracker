#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { evaluateDoctorResult } from "./doctor-gate-lib.mjs";

const DOCTOR_CMD = "bunx";
const DOCTOR_ARGS = ["expo-doctor"];
const run = spawnSync(DOCTOR_CMD, DOCTOR_ARGS, {
  encoding: "utf8",
  env: process.env,
  shell: false,
});

const decision = evaluateDoctorResult({
  status: run.status,
  output: `${run.stdout ?? ""}${run.stderr ?? ""}`,
});

if (decision.stdout) {
  process.stdout.write(decision.stdout);
}
if (decision.stderr) {
  process.stderr.write(decision.stderr);
}

process.exit(decision.exitCode);
