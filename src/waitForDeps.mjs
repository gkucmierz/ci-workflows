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
 * Scans `rootDir` (and standard subpackages `ui`, `server`, `crawler`) for `package.json`
 * and extracts all dependencies matching `scopePrefix` (default `@gkucmierz/`).
 */
export const extractScopedDependencies = (
  rootDir = process.cwd(),
  scopePrefix = '@gkucmierz/'
) => {
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
        if (!depName.startsWith(scopePrefix)) continue
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
 * on the NPM registry (`https://registry.npmjs.org`).
 */
export const checkPackageAvailability = async (
  pkgName,
  range,
  {
    registryUrl = 'https://registry.npmjs.org',
    authToken = process.env.GITEA_PKG_TOKEN || process.env.LOCAL_PACKAGE_REGISTRY || process.env.GITEA_TOKEN || '',
    fetchImpl = globalThis.fetch
  } = {}
) => {
  const encodedName = pkgName.replace('/', '%2f')
  const url = `${registryUrl.replace(/\/$/, '')}/${encodedName}?t=${Date.now()}`
  const isGiteaReg = String(url).includes('gitea.7u.pl') || String(url).includes('gitea:3000')
  const reqHeaders = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache'
  }
  if (authToken && isGiteaReg) {
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
    const latestVersion = data?.['dist-tags']?.latest || allVersions[allVersions.length - 1] || null

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
      const tarballHeaders =
        authToken && (String(tarballUrl).includes('gitea.7u.pl') || String(tarballUrl).includes('gitea:3000'))
          ? { Authorization: `token ${authToken}` }
          : {}
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
    fallbackRegistryUrl = 'https://gitea.7u.pl/api/packages/gkucmierz/npm',
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)),
    logger = console
  } = {}
) => {
  if (!deps || deps.length === 0) {
    logger.log('✅ [wait-for-deps] Brak zewnętrznych zależności @gkucmierz/* do weryfikacji.')
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
        logger.log(`✅ [wait-for-deps] ${r.name}@${r.range} -> dostępny w ${regLabel} (${r.matchedVersion})`)
      }
      return { ok: true, resolved, attempts: attempt }
    }

    const elapsedMs = Date.now() - startTime
    if (elapsedMs + pollIntervalMs > timeoutMs) {
      const details = pending
        .map((p) => `${p.name}@${p.range} (${p.reason})`)
        .join(', ')
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
