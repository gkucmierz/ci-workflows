#!/usr/bin/env node
import { scanRepositoryForLeaks } from '../src/sanitizeRepo.mjs'

const rootDir = process.argv[2] || process.cwd()
const result = scanRepositoryForLeaks(rootDir)

if (!result.clean) {
  console.error('❌ [oss-sanitize-gate] Security / OPSEC violations detected:')
  for (const v of result.violations) {
    console.error(`  - ${v.file}: [${v.ruleId}] ${v.message}`)
  }
  process.exit(1)
}

console.log(`✅ [oss-sanitize-gate] Clean (${result.scannedCount} tracked files verified).`)
