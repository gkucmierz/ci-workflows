#!/usr/bin/env node
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
    console.error(`  - ${v.file}: [${v.ruleId}] ${v.message}`)
  }
  process.exit(1)
}

console.log(`✅ [oss-sanitize-gate] Clean (${result.scannedCount} tracked files verified).`)
