import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const TEXT_EXT_RE = /\.(js|mjs|cjs|ts|tsx|jsx|vue|json|md|yml|yaml|html|css|sh)$/i

const FORBIDDEN_RULES = [
  {
    id: 'LOCAL_HOST_PATH',
    name: 'Local Host User Directory Path (/Users/<user>/... or /home/<user>/...)',
    re: /\/(?:Users|home)\/[a-zA-Z0-9][a-zA-Z0-9._-]*\//
  },
  {
    id: 'PRIVATE_KEY_BLOCK',
    name: 'PEM / OpenSSH / PGP Private Key Block',
    re: /-----BEGIN (?:RSA |OPENSSH |EC |PGP |DSA )?PRIVATE KEY-----/
  },
  {
    id: 'RAW_SECRET_TOKEN',
    name: 'Hardcoded API / Registry Token Literal',
    re: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|npm_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35})\b/
  },
  {
    id: 'SLICED_TOKEN_PREFIX',
    name: 'Sliced / Concatenated Token Prefix (Anti-Token-Slicing Guard)',
    re: /['"`](?:ghp_|github_pat_|npm_|glpat-|sk-proj-|AIza)['"`]\s*\+|\[\s*['"`](?:ghp_|github_pat_|npm_|glpat-|ghp|npm|glpat)['"`]\s*,\s*['"`]_/
  },
  {
    id: 'SECRET_LOG_SLICING',
    name: 'Partial Secret Slicing / Mask-Bypass in Workflow or Script',
    re: /(?:TOKEN|SECRET|PASSWORD|API_KEY|PAT)\s*(?:\]\s*)?\.\s*(?:slice|substring|substr|split)\s*\(/i
  }
]

/**
 * Scans git-tracked files in `rootDir` for OPSEC leaks, hardcoded secrets,
 * and token-slicing / obfuscation patterns.
 */
export const scanRepositoryForLeaks = (rootDir = process.cwd()) => {
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: rootDir,
    encoding: 'utf8'
  })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const violations = []

  for (const relPath of tracked) {
    if (
      relPath === '.agents' ||
      relPath.startsWith('.agents/') ||
      relPath === '.agent' ||
      relPath.startsWith('.agent/') ||
      relPath === 'AGENTS.md' ||
      relPath === 'agents.md'
    ) {
      violations.push({
        file: relPath,
        ruleId: 'TRACKED_AGENTS_FILE',
        message: 'Tracked .agents / AGENTS.md file is forbidden in public repositories'
      })
      continue
    }

    if (!TEXT_EXT_RE.test(relPath)) continue
    // Allow sanitizer rule definitions & unit tests to reference regex patterns
    if (relPath === 'src/sanitizeRepo.mjs' || relPath.startsWith('tests/')) continue

    const fullPath = path.join(rootDir, relPath)
    if (!fs.existsSync(fullPath)) continue

    let content = ''
    try {
      content = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }

    for (const rule of FORBIDDEN_RULES) {
      if (rule.re.test(content)) {
        violations.push({
          file: relPath,
          ruleId: rule.id,
          message: rule.name
        })
      }
    }
  }

  return {
    scannedCount: tracked.length,
    clean: violations.length === 0,
    violations
  }
}
