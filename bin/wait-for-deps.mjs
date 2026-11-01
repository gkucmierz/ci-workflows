#!/usr/bin/env node
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
        fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
        console.log(`🔗 [wait-for-deps] Zmapowano pakiety Gitea (${fallbackDeps.map((d) => d.name).join(', ')}) bezpośrednio na tarball URL w ${file}`)
      }
    }
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`)
  process.exit(1)
})
