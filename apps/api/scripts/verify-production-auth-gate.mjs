import { readFileSync } from "node:fs";

function normalizeCode(value) {
  const code = Number(String(value ?? "").trim());
  return Number.isInteger(code) ? code : null;
}

function normalizeRetryAfter(value) {
  const trimmed = String(value ?? "").trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function evaluateAuthStress(attempts) {
  const errors = [];
  let count401 = 0;
  let count429 = 0;
  let countUnexpected = 0;
  let firstRetryAfter = null;

  for (const attempt of attempts) {
    const code = normalizeCode(attempt?.code);
    if (code === 401) {
      count401 += 1;
      continue;
    }
    if (code === 429) {
      count429 += 1;
      const retryAfter = normalizeRetryAfter(attempt?.retryAfter);
      if (retryAfter !== null && firstRetryAfter === null) {
        firstRetryAfter = retryAfter;
      }
      continue;
    }
    countUnexpected += 1;
  }

  if (count401 < 1) {
    errors.push("nenhuma resposta 401 recebida no stress de auth");
  }
  if (count429 < 1) {
    errors.push("nenhuma resposta 429 recebida no stress de auth");
  }
  if (countUnexpected > 0) {
    errors.push(`respostas inesperadas no stress de auth: ${countUnexpected}`);
  }
  if (count429 > 0 && firstRetryAfter === null) {
    errors.push("nenhuma resposta 429 apresentou header Retry-After válido");
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: `401=${count401} 429=${count429} retry_after=${firstRetryAfter ?? "n/a"}`,
    counts: {
      code401: count401,
      code429: count429,
      unexpected: countUnexpected,
    },
    retryAfter: firstRetryAfter,
  };
}

export function parseAttemptsCsv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code = "", retryAfter = ""] = line.split(",", 2);
      return { code, retryAfter };
    });
}

function runCli() {
  const cliArgs = process.argv.slice(2);
  const jsonMode = cliArgs.includes("--json");
  const filePath = cliArgs.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    console.error("uso: node verify-production-auth-gate.mjs [--json] <attempts.csv>");
    process.exit(2);
  }

  const content = readFileSync(filePath, "utf8");
  const attempts = parseAttemptsCsv(content);
  const result = evaluateAuthStress(attempts);

  if (!result.ok) {
    if (jsonMode) {
      console.error(JSON.stringify(result));
      process.exit(1);
    }
    console.error(result.errors.join("; "));
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(result.summary);
}

if (import.meta.main) {
  runCli();
}
