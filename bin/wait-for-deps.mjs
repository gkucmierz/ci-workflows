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
  await waitForAllDependencies(deps, {
    timeoutMs: timeoutSec * 1000,
    pollIntervalMs: intervalSec * 1000
  })

  if (deps.length > 0) {
    const regLine = '@gkucmierz:registry=https://gitea.7u.pl/api/packages/gkucmierz/npm/'
    const npmrcPath = path.join(rootDir, '.npmrc')
    const existing = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : ''
    if (!existing.includes('@gkucmierz:registry=')) {
      fs.writeFileSync(npmrcPath, (existing ? existing.trimEnd() + '\n' : '') + regLine + '\n')
      console.log(`🔗 [wait-for-deps] Added @gkucmierz:registry to ${npmrcPath}`)
    }
    const dfPath = path.join(rootDir, 'Dockerfile')
    if (fs.existsSync(dfPath)) {
      const df = fs.readFileSync(dfPath, 'utf8')
      const patched = df.replace(/COPY\s+package\*\.json\s+\.\/(\s*)$/gm, 'COPY package*.json .npmrc* ./$1')
      if (patched !== df) {
        fs.writeFileSync(dfPath, patched)
        console.log('🔗 [wait-for-deps] Patched Dockerfile to copy .npmrc*')
      }
    }
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`)
  process.exit(1)
})
