import { describe, expect, it } from 'bun:test'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_SCRIPT = path.resolve(__dirname, '../../../scripts/verify-autonomous.sh')

describe('verify-autonomous.sh', () => {
  it('runs the full local check-all gate before the production loop', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'verify-autonomous-'))
    const scriptsDir = path.join(tempRoot, 'scripts')
    const appsApiDir = path.join(tempRoot, 'apps', 'api')

    try {
      mkdirSync(scriptsDir, { recursive: true })
      mkdirSync(appsApiDir, { recursive: true })

      const scriptPath = path.join(scriptsDir, 'verify-autonomous.sh')
      copyFileSync(SOURCE_SCRIPT, scriptPath)
      chmodSync(scriptPath, 0o755)

      writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        name: 'verify-autonomous-fixture',
        private: true,
        scripts: {
          'check-all': 'node -e "require(\'fs\').writeFileSync(\'check-all-called.txt\', \'ok\')"',
          verify: 'node -e "process.exit(23)"',
        },
      }, null, 2))

      writeFileSync(path.join(appsApiDir, 'package.json'), JSON.stringify({
        name: 'verify-autonomous-api-fixture',
        private: true,
        scripts: {
          'verify:production:loop': 'node -e "const fs=require(\'fs\'); const path=require(\'path\'); fs.writeFileSync(path.join(process.cwd(), \'..\', \'..\', \'production-loop-called.txt\'), String(process.env.CYCLES || \'\'))"',
        },
      }, null, 2))

      const result = spawnSync('bash', [scriptPath], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CYCLES: '2',
        },
      })

      expect(result.status).toBe(0)
      expect(readFileSync(path.join(tempRoot, 'check-all-called.txt'), 'utf8')).toBe('ok')
      expect(readFileSync(path.join(tempRoot, 'production-loop-called.txt'), 'utf8')).toBe('2')

      const evidenceDir = path.join(tempRoot, '.planning', 'evidence')
      const reports = readdirSync(evidenceDir).filter((name) => name.endsWith('.json'))
      expect(reports.length).toBeGreaterThan(0)

      const autonomousReportName = reports.find((name) => name.startsWith('verify-autonomous-'))
      expect(autonomousReportName).toBeDefined()
      const autonomousReport = JSON.parse(
        readFileSync(path.join(evidenceDir, autonomousReportName!), 'utf8')
      ) as { localVerifyCommand: string; status: string }

      expect(autonomousReport.status).toBe('passed')
      expect(autonomousReport.localVerifyCommand).toBe('bun run check-all')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }, 30000)
})
