#!/usr/bin/env node
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
}

main().catch((err) => {
  console.error(`❌ ${err.message}`)
  process.exit(1)
})
