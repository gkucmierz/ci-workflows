import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const binDir = path.join(rootDir, 'bin')

const WAIT_FOR_DEPS_BIN = `#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveCiRegistryContext,
  extractScopedDependencies,
  waitForAllDependencies
} from '../src/waitForDeps.mjs'

const rootDir = process.argv[2] || process.cwd()
const timeoutSec = Number(process.env.WAIT_FOR_DEPS_TIMEOUT_SEC || 180)
const intervalSec = Number(process.env.WAIT_FOR_DEPS_INTERVAL_SEC || 5)
const ctx = resolveCiRegistryContext(rootDir, {
  scopePrefix: process.env.WAIT_FOR_DEPS_SCOPE || ''
})

const main = async () => {
  const deps = extractScopedDependencies(rootDir, ctx.scopePrefix)
  const res = await waitForAllDependencies(deps, {
    timeoutMs: timeoutSec * 1000,
    pollIntervalMs: intervalSec * 1000,
    fallbackRegistryUrl: ctx.fallbackRegistryUrl
  })

  const fallbackDeps = (res.resolved || []).filter((r) => r.source === 'fallback' && r.tarballUrl)
  if (fallbackDeps.length > 0) {
    const candidateFiles = [
      'package.json',
      'ui/package.json',
      'server/package.json',
      'crawler/package.json'
    ].map((rel) => path.join(rootDir, rel)).filter((p) => fs.existsSync(p))

    for (const file of candidateFiles) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      let changed = false
      for (const item of fallbackDeps) {
        if (pkg.dependencies && pkg.dependencies[item.name]) {
          pkg.dependencies[item.name] = item.tarballUrl
          changed = true
        }
        if (pkg.devDependencies && pkg.devDependencies[item.name]) {
          pkg.devDependencies[item.name] = item.tarballUrl
          changed = true
        }
      }
      if (changed) {
        fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\\n')
        console.log(\`🔗 [wait-for-deps] Zmapowano pakiety Gitea (\${fallbackDeps.map((d) => d.name).join(', ')}) bezpośrednio na tarball URL w \${file}\`)
      }
    }
  }
}

main().catch((err) => {
  console.error(\`❌ \${err.message}\`)
  process.exit(1)
})
`

const SANITIZE_CHECK_BIN = `#!/usr/bin/env node
import { scanRepositoryForLeaks } from '../src/sanitizeRepo.mjs'

const args = process.argv.slice(2)
let rootDir = process.cwd()
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) {
    rootDir = args[i + 1]
    break
  } else if (args[i].startsWith('--root=')) {
    rootDir = args[i].slice('--root='.length)
    break
  } else if (!args[i].startsWith('-')) {
    rootDir = args[i]
    break
  }
}

const result = scanRepositoryForLeaks(rootDir)

if (!result.clean) {
  console.error('❌ [oss-sanitize-gate] Security / OPSEC violations detected:')
  for (const v of result.violations) {
    console.error(\`  - \${v.file}: [\${v.ruleId}] \${v.message}\`)
  }
  process.exit(1)
}

console.log(\`✅ [oss-sanitize-gate] Clean (\${result.scannedCount} tracked files verified).\`)
`

const POST_DEPLOY_HEALTHCHECK_BIN = `#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  DEFAULT_HEALTHY_STATUSES,
  DEFAULT_HEALTHCHECK_RETRIES,
  DEFAULT_HEALTHCHECK_INTERVAL_MS,
  DEFAULT_HEALTHCHECK_TIMEOUT_MS,
  parseExpectedStatuses,
  parseBooleanFlag,
  resolveHealthcheckUrl,
  probeExternalHealthcheck,
  evaluatePostDeployHealth
} from '../src/healthcheck.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isContainerRunning = (containerName) => {
  try {
    const out = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.trim() === 'true'
  } catch {
    return false
  }
}

const probeContainerInternalHttp = (containerName, port = 80) => {
  const safePort = Number.isInteger(Number(port)) && Number(port) > 0 ? Number(port) : 80
  const cmd = \`wget -q -O /dev/null http://127.0.0.1:\${safePort}/ 2>/dev/null || curl -fsS -o /dev/null http://127.0.0.1:\${safePort}/ 2>/dev/null\`
  try {
    execFileSync('docker', ['exec', containerName, 'sh', '-c', cmd], {
      stdio: 'ignore',
      timeout: 5000
    })
    return true
  } catch {
    return false
  }
}

const printContainerLogs = (containerName) => {
  try {
    const logs = execFileSync('docker', ['logs', containerName, '--tail', '40'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (logs && logs.trim()) {
      console.error(\`--- docker logs \${containerName} (last 40 lines) ---\\n\${logs.trim()}\`)
    }
  } catch {
    // Container may not exist on this runner
  }
}

const main = async () => {
  const containerName = String(process.env.HC_CONTAINER || process.argv[2] || '').trim()
  const inputUrl = String(process.env.HC_URL || process.argv[3] || '').trim()
  const requireExternal = parseBooleanFlag(process.env.HC_REQUIRE_EXTERNAL, true)
  const retries = Math.max(1, Number(process.env.HC_RETRIES || DEFAULT_HEALTHCHECK_RETRIES))
  const intervalMs = Math.max(0, Number(process.env.HC_INTERVAL_SEC || DEFAULT_HEALTHCHECK_INTERVAL_MS / 1000) * 1000)
  const timeoutMs = Math.max(1000, Number(process.env.HC_TIMEOUT_SEC || DEFAULT_HEALTHCHECK_TIMEOUT_MS / 1000) * 1000)
  const internalPort = Number(process.env.HC_INTERNAL_PORT || 80)
  const expectedStatuses = parseExpectedStatuses(process.env.HC_EXPECTED_STATUS || DEFAULT_HEALTHY_STATUSES)
  const runnerName = String(process.env.RUNNER_NAME || '').trim()

  const externalUrl = resolveHealthcheckUrl({ inputUrl, packageJsonPath: 'package.json' })
  console.log(
    \`🔍 [healthcheck] Starting dual-layer verification for container "\${containerName || '(none)'}"\` +
      \`\${runnerName ? \` on runner "\${runnerName}"\` : ''}\` +
      \`\${externalUrl ? \` (external: \${externalUrl}, requireExternal=\${requireExternal})\` : ' (no external URL)'}...\`
  )

  let containerRunning = false
  let internalOk = false

  if (containerName) {
    const phase1Attempts = Math.min(retries, 5)
    for (let i = 1; i <= phase1Attempts; i += 1) {
      containerRunning = isContainerRunning(containerName)
      if (containerRunning) {
        internalOk = probeContainerInternalHttp(containerName, internalPort)
        if (internalOk || externalUrl) break
      }
      if (i < phase1Attempts) {
        console.log(\`⏳ [healthcheck] Waiting for container "\${containerName}" readiness (\${i}/\${phase1Attempts})...\`)
        await sleep(intervalMs)
      }
    }
    if (containerRunning) {
      console.log(
        internalOk
          ? \`✅ [healthcheck] Phase 1 passed: container "\${containerName}" running & 127.0.0.1:\${internalPort} HTTP 200.\`
          : \`ℹ️ [healthcheck] Phase 1: container "\${containerName}" is running (internal 127.0.0.1:\${internalPort} probe not applicable or pending).\`
      )
    }
  } else {
    containerRunning = true
  }

  let externalResult = null
  if (containerRunning && externalUrl) {
    externalResult = await probeExternalHealthcheck({
      url: externalUrl,
      retries,
      intervalMs,
      timeoutMs,
      expectedStatuses,
      logger: console
    })
  }

  const verdict = evaluatePostDeployHealth({
    containerName: containerName || 'service',
    containerRunning,
    internalOk,
    externalUrl,
    externalResult,
    requireExternal
  })

  if (verdict.warning) {
    console.warn(\`⚠️ [healthcheck] \${verdict.warning}\`)
  }
  if (!verdict.ok) {
    console.error(\`❌ [healthcheck] \${verdict.reason}\`)
    if (containerName) printContainerLogs(containerName)
    process.exit(1)
  }

  console.log(\`✅ [healthcheck] \${verdict.reason}\`)
}

main().catch((err) => {
  console.error(\`❌ [healthcheck] \${err?.message || err}\`)
  process.exit(1)
})
`

export const buildCliBinaries = (targetBinDir = binDir) => {
  fs.mkdirSync(targetBinDir, { recursive: true })
  const waitBinPath = path.join(targetBinDir, 'wait-for-deps.mjs')
  const sanitizeBinPath = path.join(targetBinDir, 'sanitize-check.mjs')
  const healthcheckBinPath = path.join(targetBinDir, 'post-deploy-healthcheck.mjs')

  fs.writeFileSync(waitBinPath, WAIT_FOR_DEPS_BIN, { mode: 0o755 })
  fs.writeFileSync(sanitizeBinPath, SANITIZE_CHECK_BIN, { mode: 0o755 })
  fs.writeFileSync(healthcheckBinPath, POST_DEPLOY_HEALTHCHECK_BIN, { mode: 0o755 })
  return { waitBinPath, sanitizeBinPath, healthcheckBinPath }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCliBinaries()
}
