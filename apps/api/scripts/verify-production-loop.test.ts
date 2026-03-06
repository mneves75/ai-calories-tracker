import { describe, expect, it } from 'bun:test'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_SCRIPT = path.join(__dirname, 'verify-production-loop.sh')

describe('verify-production-loop.sh', () => {
  it('reports only successful cycles in completedCycles when a later cycle fails', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'verify-production-loop-'))
    const appsApiDir = path.join(tempRoot, 'apps', 'api')
    const scriptsDir = path.join(appsApiDir, 'scripts')
    const reportPath = path.join(tempRoot, 'loop-report.json')
    const statePath = path.join(tempRoot, 'cycle-state.txt')

    try {
      mkdirSync(scriptsDir, { recursive: true })
      const loopScriptPath = path.join(scriptsDir, 'verify-production-loop.sh')
      copyFileSync(SOURCE_SCRIPT, loopScriptPath)
      chmodSync(loopScriptPath, 0o755)

      const stubVerifyProductionPath = path.join(scriptsDir, 'verify-production.sh')
      writeFileSync(stubVerifyProductionPath, `#!/usr/bin/env bash
set -euo pipefail
cycle=0
if [ -f "$STATE_FILE" ]; then
  cycle="$(cat "$STATE_FILE")"
fi
cycle=$((cycle + 1))
printf '%s' "$cycle" > "$STATE_FILE"
status="passed"
if [ "$cycle" -eq "$FAIL_ON_CYCLE" ]; then
  status="failed"
fi
OUT="$VERIFY_PRODUCTION_REPORT_PATH" STATUS="$status" node -e 'const fs=require("fs"); fs.writeFileSync(process.env.OUT, JSON.stringify({ status: process.env.STATUS }, null, 2));'
if [ "$status" = "failed" ]; then
  exit 1
fi
`)
      chmodSync(stubVerifyProductionPath, 0o755)

      const result = spawnSync('bash', [loopScriptPath], {
        cwd: scriptsDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          CYCLES: '3',
          FAIL_ON_CYCLE: '2',
          STATE_FILE: statePath,
          VERIFY_PRODUCTION_LOOP_REPORT_PATH: reportPath,
        },
      })

      expect(result.status).toBe(1)

      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        completedCycles: number
        failedCycle: number | null
        status: string
        results: Array<{ cycle: number; status: string }>
      }

      expect(report.status).toBe('failed')
      expect(report.completedCycles).toBe(1)
      expect(report.failedCycle).toBe(2)
      expect(report.results.length).toBe(2)
      expect(report.results[1]).toEqual({ cycle: 2, status: 'failed' })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }, 30000)
})
