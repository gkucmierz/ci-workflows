import fs from 'node:fs'
import path from 'node:path'

/**
 * Parses a SemVer string `X.Y.Z` into `{ major, minor, patch }`.
 */
export const parseSemver = (versionStr) => {
  const clean = String(versionStr || '')
    .trim()
    .replace(/^[^\d]*/, '')
    .split('-')[0]
  const parts = clean.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    return null
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] }
}

/**
 * Compares two SemVer strings `a` and `b`. Returns:
 *  1 if a > b, -1 if a < b, 0 if a === b.
 */
export const compareSemver = (a, b) => {
  const va = parseSemver(a)
  const vb = parseSemver(b)
  if (!va || !vb) return 0
  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1
  return 0
}

/**
 * Checks whether a published `candidateVersion` satisfies `rangeSpec`
 * (supports exact `1.2.0`, caret `^1.2.0`, tilde `~1.2.0`, `>=1.2.0`, or `*`/`latest`).
 */
export const isVersionSatisfied = (candidateVersion, rangeSpec) => {
  const raw = String(rangeSpec || '').trim()
  if (!raw || raw === '*' || raw === 'latest') {
    return Boolean(parseSemver(candidateVersion))
  }

  const cand = parseSemver(candidateVersion)
  const floor = parseSemver(raw)
  if (!cand || !floor) return false

  if (raw.startsWith('^')) {
    if (floor.major > 0) {
      return cand.major === floor.major && compareSemver(candidateVersion, raw) >= 0
    }
    return (
      cand.major === 0 &&
      cand.minor === floor.minor &&
      compareSemver(candidateVersion, raw) >= 0
    )
  }

  if (raw.startsWith('~')) {
    return (
      cand.major === floor.major &&
      cand.minor === floor.minor &&
      cand.patch >= floor.patch
    )
  }

  if (raw.startsWith('>=')) {
    return compareSemver(candidateVersion, raw) >= 0
  }

  // Exact match
  return (
    cand.major === floor.major &&
    cand.minor === floor.minor &&
    cand.patch === floor.patch
  )
}

/**
 * Normalizes a scope string (`acme`, `@acme`, `@acme/`) to `@acme/`, or `''` if empty.
 */
export const normalizeScopePrefix = (rawScope) => {
  const trimmed = String(rawScope || '').trim()
  if (!trimmed) return ''
  const withAt = trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  return withAt.endsWith('/') ? withAt : `${withAt}/`
}

const parseOriginSafe = (urlStr) => {
  try {
    return urlStr ? new URL(String(urlStr).trim()).origin : ''
  } catch {
    return ''
  }
}

/**
 * Dynamically resolves CI owner, scope prefix, server origin, and private NPM registry URL
 * from explicit overrides, Gitea/GitHub Actions env vars, `.npmrc`, and `package.json`.
 */
export const resolveCiRegistryContext = (rootDir = process.cwd(), overrides = {}) => {
  const env = overrides.env || process.env
  const subDirs = ['.', 'ui', 'server', 'crawler', 'client', 'app', 'web']

  let npmrcScope = ''
  let npmrcRegistry = ''
  for (const sub of subDirs) {
    const npmrcPath = path.join(rootDir, sub, '.npmrc')
    if (!fs.existsSync(npmrcPath)) continue
    try {
      const lines = fs.readFileSync(npmrcPath, 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
        const scopedMatch = trimmed.match(/^(@[^:=\s]+):registry\s*=\s*(\S+)/)
        if (scopedMatch) {
          if (!npmrcScope) npmrcScope = scopedMatch[1]
          if (!npmrcRegistry && !scopedMatch[2].includes('registry.npmjs.org')) {
            npmrcRegistry = scopedMatch[2]
          }
          continue
        }
        const plainMatch = trimmed.match(/^registry\s*=\s*(\S+)/)
        if (plainMatch && !plainMatch[1].includes('registry.npmjs.org') && !npmrcRegistry) {
          npmrcRegistry = plainMatch[1]
        }
      }
    } catch {
      // Ignore unreadable .npmrc
    }
  }

  let pkgScope = ''
  for (const sub of subDirs) {
    const pkgPath = path.join(rootDir, sub, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg?.name && String(pkg.name).startsWith('@') && String(pkg.name).includes('/')) {
        pkgScope = String(pkg.name).split('/')[0]
        break
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  const npmrcOwnerMatch = npmrcRegistry.match(/\/api\/packages\/([^/]+)\/npm/i)
  const npmrcOwner = npmrcOwnerMatch ? decodeURIComponent(npmrcOwnerMatch[1]) : ''
  const repoFull = String(env.GITEA_REPO_FULL || env.GITHUB_REPOSITORY || '').trim()
  const repoSlugOwner = repoFull.includes('/') ? repoFull.split('/')[0].trim() : ''
  const pkgScopeOwner = pkgScope ? pkgScope.replace(/^@/, '') : ''

  const repoOwner = String(
    overrides.repoOwner ||
      env.GITEA_OWNER_INPUT ||
      env.GITHUB_REPOSITORY_OWNER ||
      repoSlugOwner ||
      npmrcOwner ||
      pkgScopeOwner ||
      ''
  ).trim()

  const scopePrefix =
    normalizeScopePrefix(
      overrides.scopePrefix || env.WAIT_FOR_DEPS_SCOPE || env.PACKAGE_SCOPE_INPUT
    ) ||
    normalizeScopePrefix(npmrcScope) ||
    (repoOwner ? `@${repoOwner}/` : '') ||
    normalizeScopePrefix(pkgScope)

  const serverOrigin =
    parseOriginSafe(overrides.serverUrl || env.GITEA_SERVER_URL || env.GITHUB_SERVER_URL) ||
    parseOriginSafe(
      overrides.privateRegistryUrl ||
        env.WAIT_FOR_DEPS_FALLBACK_REGISTRY ||
        env.PRIVATE_REGISTRY_INPUT ||
        npmrcRegistry
    )

  let fallbackRegistryUrl = null
  if (
    Object.prototype.hasOwnProperty.call(overrides, 'fallbackRegistryUrl') &&
    overrides.fallbackRegistryUrl !== undefined
  ) {
    fallbackRegistryUrl = overrides.fallbackRegistryUrl
  } else {
    const rawFallback =
      overrides.privateRegistryUrl ||
      env.WAIT_FOR_DEPS_FALLBACK_REGISTRY ||
      env.PRIVATE_REGISTRY_INPUT ||
      npmrcRegistry ||
      (serverOrigin && repoOwner && !serverOrigin.includes('github.com')
        ? `${serverOrigin}/api/packages/${repoOwner}/npm`
        : '')
    fallbackRegistryUrl = rawFallback ? String(rawFallback).trim().replace(/\/+$/, '') : null
  }

  return {
    repoOwner,
    scopePrefix,
    serverOrigin,
    fallbackRegistryUrl
  }
}

/**
 * Detects whether a registry or tarball URL belongs to a private / self-hosted Gitea registry
 * (never matches public `registry.npmjs.org` or `registry.yarnpkg.com`).
 */
export const isPrivateRegistryUrl = (urlStr, env = process.env) => {
  const raw = String(urlStr || '').trim()
  if (!raw) return false
  let parsedHost = ''
  try {
    parsedHost = new URL(raw).host.toLowerCase()
  } catch {
    return raw.includes('/api/packages/') || raw.includes('gitea:3000')
  }
  if (!parsedHost || parsedHost === 'registry.npmjs.org' || parsedHost === 'registry.yarnpkg.com') {
    return false
  }
  if (raw.includes('/api/packages/') || parsedHost === 'gitea:3000') {
    return true
  }
  for (const candidate of [
    env.GITEA_SERVER_URL,
    env.GITHUB_SERVER_URL,
    env.PRIVATE_REGISTRY_INPUT,
    env.WAIT_FOR_DEPS_FALLBACK_REGISTRY
  ]) {
    if (!candidate) continue
    try {
      const ch = new URL(String(candidate).trim()).host.toLowerCase()
      if (ch && ch !== 'github.com' && ch === parsedHost) return true
    } catch {
      // Ignore invalid URL env
    }
  }
  return false
}

/**
 * Scans `rootDir` (and standard subpackages `ui`, `server`, `crawler`) for `package.json`
 * and extracts all dependencies matching `scopePrefix` (dynamically detected when omitted).
 */
export const extractScopedDependencies = (rootDir = process.cwd(), scopePrefix = '') => {
  const effectiveScope =
    normalizeScopePrefix(scopePrefix) || resolveCiRegistryContext(rootDir).scopePrefix
  if (!effectiveScope) return []

  const candidateFiles = [
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'ui', 'package.json'),
    path.join(rootDir, 'server', 'package.json'),
    path.join(rootDir, 'crawler', 'package.json')
  ]

  const requiredMap = new Map()

  for (const file of candidateFiles) {
    if (!fs.existsSync(file)) continue
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      const merged = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {})
      }
      for (const [depName, rangeSpec] of Object.entries(merged)) {
        if (!depName.startsWith(effectiveScope)) continue
        if (String(rangeSpec).startsWith('file:') || String(rangeSpec).startsWith('workspace:')) {
          continue
        }
        const prev = requiredMap.get(depName)
        if (!prev || compareSemver(rangeSpec, prev) > 0) {
          requiredMap.set(depName, String(rangeSpec).trim())
        }
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  return Array.from(requiredMap.entries()).map(([name, range]) => ({ name, range }))
}

/**
 * Checks whether at least one version satisfying `range` is published AND its tarball is reachable
 * on the target NPM registry.
 */
export const checkPackageAvailability = async (
  pkgName,
  range,
  {
    registryUrl = 'https://registry.npmjs.org',
    authToken = process.env.GITEA_PKG_TOKEN ||
      process.env.LOCAL_PACKAGE_REGISTRY ||
      process.env.GITEA_TOKEN ||
      '',
    isPrivateRegistry = false,
    fetchImpl = globalThis.fetch
  } = {}
) => {
  const encodedName = pkgName.replace('/', '%2f')
  const url = `${registryUrl.replace(/\/$/, '')}/${encodedName}?t=${Date.now()}`
  const isPrivReg = isPrivateRegistry || isPrivateRegistryUrl(url)
  const reqHeaders = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache'
  }
  if (authToken && isPrivReg && !url.includes('registry.npmjs.org')) {
    reqHeaders.Authorization = `token ${authToken}`
  }

  try {
    const res = await fetchImpl(url, {
      headers: reqHeaders
    })
    if (!res.ok) {
      return {
        available: false,
        matchedVersion: null,
        latestVersion: null,
        reason: `HTTP ${res.status}`
      }
    }

    const data = await res.json()
    const versionsObj = data?.versions || {}
    const allVersions = Object.keys(versionsObj).sort(compareSemver)
    const latestVersion =
      data?.['dist-tags']?.latest || allVersions[allVersions.length - 1] || null

    const matchingVersions = allVersions.filter((v) => isVersionSatisfied(v, range))
    if (matchingVersions.length === 0) {
      return {
        available: false,
        matchedVersion: null,
        latestVersion,
        reason: `Brak wersji spełniającej ${range} (najnowsza w rejestrze: ${latestVersion || 'brak'})`
      }
    }

    const bestMatch = matchingVersions[matchingVersions.length - 1]
    const tarballUrl = versionsObj[bestMatch]?.dist?.tarball

    if (tarballUrl) {
      const sendAuthForTarball =
        Boolean(authToken) &&
        !String(tarballUrl).includes('registry.npmjs.org') &&
        (isPrivReg || isPrivateRegistryUrl(tarballUrl))
      const tarballHeaders = sendAuthForTarball ? { Authorization: `token ${authToken}` } : {}
      const headRes = await fetchImpl(tarballUrl, { method: 'HEAD', headers: tarballHeaders })
      if (!headRes.ok && headRes.status !== 405) {
        return {
          available: false,
          matchedVersion: bestMatch,
          latestVersion,
          reason: `Metadane ${bestMatch} widoczne, ale tarball CDN zwraca HTTP ${headRes.status}`
        }
      }
    }

    return {
      available: true,
      matchedVersion: bestMatch,
      latestVersion,
      tarballUrl: tarballUrl || null,
      reason: 'OK'
    }
  } catch (err) {
    return {
      available: false,
      matchedVersion: null,
      latestVersion: null,
      tarballUrl: null,
      reason: err?.message || String(err)
    }
  }
}

/**
 * Polls asynchronously until all scoped dependencies are downloadable from the registry,
 * or throws an error after `timeoutMs`.
 */
export const waitForAllDependencies = async (
  deps,
  {
    timeoutMs = 180e3,
    pollIntervalMs = 5e3,
    registryUrl = 'https://registry.npmjs.org',
    fallbackRegistryUrl = resolveCiRegistryContext().fallbackRegistryUrl,
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)),
    logger = console
  } = {}
) => {
  if (!deps || deps.length === 0) {
    logger.log('✅ [wait-for-deps] Brak zewnętrznych zależności wewnętrznych do weryfikacji.')
    return { ok: true, resolved: [] }
  }

  const startTime = Date.now()
  let attempt = 0

  while (true) {
    attempt++
    const pending = []
    const resolved = []

    for (const dep of deps) {
      let status = await checkPackageAvailability(dep.name, dep.range, {
        registryUrl,
        fetchImpl
      })
      let source = 'npmjs'
      if (!status.available && fallbackRegistryUrl && fallbackRegistryUrl !== registryUrl) {
        const giteaStatus = await checkPackageAvailability(dep.name, dep.range, {
          registryUrl: fallbackRegistryUrl,
          isPrivateRegistry: true,
          fetchImpl
        })
        if (giteaStatus.available) {
          status = giteaStatus
          source = 'fallback'
        } else {
          status = {
            ...status,
            reason: `npmjs: ${status.reason} | gitea: ${giteaStatus.reason}`
          }
        }
      }
      if (status.available) {
        resolved.push({
          ...dep,
          matchedVersion: status.matchedVersion,
          tarballUrl: status.tarballUrl || null,
          source
        })
      } else {
        pending.push({ ...dep, ...status })
      }
    }

    if (pending.length === 0) {
      for (const r of resolved) {
        const regLabel = r.source === 'fallback' ? 'Gitea Packages' : 'npmjs.org'
        logger.log(
          `✅ [wait-for-deps] ${r.name}@${r.range} -> dostępny w ${regLabel} (${r.matchedVersion})`
        )
      }
      return { ok: true, resolved, attempts: attempt }
    }

    const elapsedMs = Date.now() - startTime
    if (elapsedMs + pollIntervalMs > timeoutMs) {
      const details = pending.map((p) => `${p.name}@${p.range} (${p.reason})`).join(', ')
      throw new Error(
        `[wait-for-deps] Przekroczono limit czasu (${Math.round(timeoutMs / 1000)}s) oczekiwania na paczki: ${details}`
      )
    }

    for (const p of pending) {
      logger.log(
        `⏳ [wait-for-deps] Próba #${attempt}: Oczekiwanie na ${p.name}@${p.range} — ${p.reason}. Kolejne sprawdzenie za ${Math.round(pollIntervalMs / 1000)}s...`
      )
    }

    await sleepImpl(pollIntervalMs)
  }
}

/**
 * Deterministically rewrites `npm ci` (including `npm --prefix <dir> ci`) to `npm install`
 * and injects `COPY <src>/vendor-tarballs <dest>/vendor-tarballs/` instructions ONLY for
 * package directories whose `vendor-tarballs/` folder actually exists on disk (`existingVendorDirs`).
 */
export const patchDockerfileVendorTarballs = (
  dockerfileContent,
  dfRelPath = 'Dockerfile',
  existingVendorDirs = []
) => {
  const vendorSet = new Set(
    Array.from(existingVendorDirs || []).map((d) => String(d || '.').replace(/\/+$/, '') || '.')
  )
  let content = String(dockerfileContent || '').replace(
    /\bnpm(\s+(?:--prefix\s+\S+\s+)*)ci\b/g,
    'npm$1install'
  )
  if (content.includes('vendor-tarballs') || vendorSet.size === 0) {
    return content
  }

  const normalizedDf = String(dfRelPath || 'Dockerfile').replace(/\\/g, '/')
  const dfDir = path.posix.dirname(normalizedDf) || '.'
  const subDirsRe = /^(ui|server|crawler|client|app|web)\/package/

  const patchedLines = []
  for (const line of content.split('\n')) {
    const copyMatch = line.match(/^(\s*COPY\s+(?:--\S+\s+)*)(.+?)\s+(\S+)\s*$/)
    if (copyMatch) {
      const [, prefix, sourcesStr, rawDest] = copyMatch
      const tokens = sourcesStr.trim().split(/\s+/)
      const destVendor =
        rawDest === '/'
          ? '/vendor-tarballs/'
          : `${rawDest.replace(/\/+$/, '') || '.'}/vendor-tarballs/`

      let injected = false
      for (const tok of tokens) {
        const subMatch = tok.match(subDirsRe)
        if (subMatch && vendorSet.has(subMatch[1])) {
          patchedLines.push(`${prefix}${subMatch[1]}/vendor-tarballs ${destVendor}`)
          injected = true
          break
        }
      }
      if (!injected && tokens.some((tok) => /^(?:\.\/)?package/.test(tok)) && vendorSet.has(dfDir)) {
        patchedLines.push(`${prefix}vendor-tarballs ${destVendor}`)
      }
    }
    patchedLines.push(line)
  }

  return patchedLines.join('\n')
}
