import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const binDir = path.join(rootDir, 'bin')

const WAIT_FOR_DEPS_BIN = `#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { extractScopedDependencies, waitForAllDependencies } from '../src/waitForDeps.mjs'

const rootDir = process.argv[2] || process.cwd()
const timeoutSec = Number(process.env.WAIT_FOR_DEPS_TIMEOUT_SEC || 180)
const intervalSec = Number(process.env.WAIT_FOR_DEPS_INTERVAL_SEC || 5)
const scopePrefix = process.env.WAIT_FOR_DEPS_SCOPE || '@gkucmierz/'

const main = async () => {
  const deps = extractScopedDependencies(rootDir, scopePrefix)
  const res = await waitForAllDependencies(deps, {
    timeoutMs: timeoutSec * 1000,
    pollIntervalMs: intervalSec * 1000
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

export const buildCliBinaries = (targetBinDir = binDir) => {
  fs.mkdirSync(targetBinDir, { recursive: true })
  const waitBinPath = path.join(targetBinDir, 'wait-for-deps.mjs')
  const sanitizeBinPath = path.join(targetBinDir, 'sanitize-check.mjs')

  fs.writeFileSync(waitBinPath, WAIT_FOR_DEPS_BIN, { mode: 0o755 })
  fs.writeFileSync(sanitizeBinPath, SANITIZE_CHECK_BIN, { mode: 0o755 })
  return { waitBinPath, sanitizeBinPath }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCliBinaries()
}
