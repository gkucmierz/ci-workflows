import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_HEALTHY_STATUSES = Object.freeze([200, 204, 301, 302, 307, 308])
export const DEFAULT_HEALTHCHECK_RETRIES = 8
export const DEFAULT_HEALTHCHECK_INTERVAL_MS = 2000
export const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 10000

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Parses a comma-separated list (or array) of HTTP status codes into a normalized Set<number>.
 */
export const parseExpectedStatuses = (spec = DEFAULT_HEALTHY_STATUSES) => {
  if (spec instanceof Set) {
    const out = new Set([...spec].map(Number).filter((n) => Number.isInteger(n) && n >= 100 && n <= 599))
    return out.size > 0 ? out : new Set(DEFAULT_HEALTHY_STATUSES)
  }
  const rawList = Array.isArray(spec)
    ? spec
    : String(spec || '')
        .split(/[,\s]+/)
        .filter(Boolean)
  const parsed = new Set(rawList.map(Number).filter((n) => Number.isInteger(n) && n >= 100 && n <= 599))
  return parsed.size > 0 ? parsed : new Set(DEFAULT_HEALTHY_STATUSES)
}

/**
 * Normalizes boolean-like workflow inputs ('true', 'false', '1', '0', boolean).
 */
export const parseBooleanFlag = (value, defaultValue = true) => {
  if (value === true || value === false) return value
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return defaultValue
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false
  return defaultValue
}

/**
 * Resolves the external healthcheck URL from explicit workflow input or fallback package.json homepage.
 */
export const resolveHealthcheckUrl = ({ inputUrl = '', packageJsonPath = 'package.json' } = {}) => {
  const explicit = String(inputUrl || '').trim()
  if (explicit) return explicit
  if (!packageJsonPath) return ''
  const resolvedPath = path.resolve(packageJsonPath)
  if (!fs.existsSync(resolvedPath)) return ''
  try {
    const pkg = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
    const homepage = String(pkg?.homepage || '').trim()
    if (/^https?:\/\//i.test(homepage)) {
      return homepage
    }
  } catch {
    // Ignore malformed or missing package.json
  }
  return ''
}

/**
 * Produces a concise, actionable diagnostic message for failed external HTTP healthchecks.
 */
export const classifyHealthcheckFailure = ({ status = 0, error = '', url = '' } = {}) => {
  const code = Number(status) || 0
  const target = url || 'target URL'
  if (code === 502 || code === 503 || code === 504) {
    return (
      `HTTP ${code} on ${target}: upstream gateway unreachable — verify reverse proxy hostname/port, ` +
      'shared Docker bridge network, and that the job ran on the intended target runner (static runs-on label).'
    )
  }
  if (code === 525 || code === 526) {
    return (
      `HTTP ${code} on ${target}: TLS/SSL handshake or certificate validation failed at reverse proxy — ` +
      'verify proxy host domain and TLS certificate configuration.'
    )
  }
  if (code === 521 || code === 522 || code === 523 || code === 520 || code === 524) {
    return (
      `HTTP ${code} on ${target}: edge proxy could not reach origin host — ` +
      'verify DNS A/CNAME target, firewall rules, and origin proxy status.'
    )
  }
  if (code === 404) {
    return (
      `HTTP 404 on ${target}: endpoint returned Not Found — verify healthcheck_url path, ` +
      'Nginx location/root config, or static bundle copy.'
    )
  }
  if (code >= 400 && code <= 599) {
    return `HTTP ${code} on ${target}: unexpected non-healthy HTTP response.`
  }
  const errDetail = String(error || 'connection failed').trim()
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(target) && /ECONNREFUSED/i.test(errDetail)) {
    return (
      `Network error probing ${target}: ${errDetail} — if the container uses expose-only networking ` +
      '(no host ports: binding in docker-compose.yml), replace healthcheck_url with the public https:// domain or omit it.'
    )
  }
  return `Network/TLS error probing ${target}: ${errDetail}`
}

/**
 * Probes an external/public HTTP(S) URL with bounded retries and timeout.
 * Never treats 5xx or Cloudflare origin errors as healthy.
 */
export const probeExternalHealthcheck = async ({
  url,
  retries = DEFAULT_HEALTHCHECK_RETRIES,
  intervalMs = DEFAULT_HEALTHCHECK_INTERVAL_MS,
  timeoutMs = DEFAULT_HEALTHCHECK_TIMEOUT_MS,
  expectedStatuses = DEFAULT_HEALTHY_STATUSES,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleepDefault,
  logger = console
} = {}) => {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) {
    return {
      ok: true,
      skipped: true,
      url: '',
      status: 0,
      attempts: 0,
      location: '',
      diagnosis: '',
      error: ''
    }
  }

  const allowed = parseExpectedStatuses(expectedStatuses)
  const maxAttempts = Math.max(1, Math.min(30, Number(retries) || DEFAULT_HEALTHCHECK_RETRIES))
  const delayMs = Math.max(0, Number(intervalMs) || DEFAULT_HEALTHCHECK_INTERVAL_MS)
  const reqTimeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_HEALTHCHECK_TIMEOUT_MS)

  let lastStatus = 0
  let lastError = ''
  let lastLocation = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastStatus = 0
    lastError = ''
    lastLocation = ''

    try {
      const signal =
        globalThis.AbortSignal && globalThis.AbortSignal.timeout
          ? globalThis.AbortSignal.timeout(reqTimeoutMs)
          : undefined
      const res = await fetchImpl(cleanUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
          'User-Agent': 'ci-workflows-healthcheck/1.0'
        },
        ...(signal ? { signal } : {})
      })
      lastStatus = Number(res?.status) || 0
      lastLocation =
        res?.headers && res.headers.get ? String(res.headers.get('location') || '') : ''

      if (allowed.has(lastStatus)) {
        return {
          ok: true,
          skipped: false,
          url: cleanUrl,
          status: lastStatus,
          attempts: attempt,
          location: lastLocation,
          diagnosis: '',
          error: ''
        }
      }
    } catch (err) {
      lastError = err?.cause?.code || err?.cause?.message || err?.message || String(err)
    }

    if (attempt < maxAttempts) {
      const detail = lastStatus > 0 ? `HTTP ${lastStatus}` : lastError || 'no response'
      logger?.log?.(
        `⏳ [healthcheck] External probe ${attempt}/${maxAttempts} for ${cleanUrl} returned ${detail}; retrying in ${Math.round(delayMs / 1000)}s...`
      )
      await sleepImpl(delayMs)
    }
  }

  const diagnosis = classifyHealthcheckFailure({
    status: lastStatus,
    error: lastError,
    url: cleanUrl
  })

  return {
    ok: false,
    skipped: false,
    url: cleanUrl,
    status: lastStatus,
    attempts: maxAttempts,
    location: lastLocation,
    diagnosis,
    error: lastError
  }
}

/**
 * Pure two-phase post-deploy health evaluator:
 * 1. Container MUST be running.
 * 2. When `externalUrl` is configured and `requireExternal` is true (default),
 *    an internal 127.0.0.1 HTTP 200 MUST NEVER mask an external 502/525/5xx failure.
 */
export const evaluatePostDeployHealth = ({
  containerName = '',
  containerRunning = false,
  internalOk = false,
  externalUrl = '',
  externalResult = null,
  requireExternal = true
} = {}) => {
  const targetContainer = String(containerName || 'container')
  if (!containerRunning) {
    return {
      ok: false,
      phase: 'container',
      warning: '',
      reason: `Container "${targetContainer}" is not running after deploy.`
    }
  }

  const hasExternal = Boolean(String(externalUrl || '').trim())
  if (!hasExternal) {
    return {
      ok: true,
      phase: internalOk ? 'internal' : 'container',
      warning: '',
      reason: internalOk
        ? `Internal container probe passed (${targetContainer} -> 127.0.0.1 HTTP 200).`
        : `Container "${targetContainer}" is running (no external healthcheck_url configured).`
    }
  }

  if (externalResult?.ok) {
    return {
      ok: true,
      phase: 'external',
      warning: '',
      reason:
        `Dual-layer smoke test passed: container "${targetContainer}" running` +
        `${internalOk ? ' (internal HTTP 200)' : ''} and external ${externalUrl} -> HTTP ${externalResult.status}.`
    }
  }

  const diag =
    externalResult?.diagnosis ||
    classifyHealthcheckFailure({
      status: externalResult?.status || 0,
      error: externalResult?.error || 'external probe did not run',
      url: externalUrl
    })

  if (!requireExternal) {
    return {
      ok: true,
      phase: 'external-warn',
      warning: `External healthcheck failed (non-blocking because require_external_healthcheck=false): ${diag}`,
      reason: `Container "${targetContainer}" running; external warning logged.`
    }
  }

  return {
    ok: false,
    phase: 'external',
    warning: '',
    reason:
      `Container "${targetContainer}" is running locally${internalOk ? ' (internal HTTP 200)' : ''}, ` +
      `but external healthcheck FAILED — ${diag}`
  }
}
