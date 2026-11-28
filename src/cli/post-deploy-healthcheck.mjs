#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  DEFAULT_HEALTHY_STATUSES,
  DEFAULT_HEALTHCHECK_RETRIES,
  DEFAULT_HEALTHCHECK_INTERVAL_MS,
  DEFAULT_HEALTHCHECK_TIMEOUT_MS,
  parseExpectedStatuses,
  parseBooleanFlag,
  resolveHealthcheckUrl,
  probeExternalHealthcheck,
  evaluatePostDeployHealth
} from '../healthcheck.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isContainerRunning = (containerName) => {
  try {
    const out = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.trim() === 'true'
  } catch {
    return false
  }
}

const probeContainerInternalHttp = (containerName, port = 80) => {
  const safePort = Number.isInteger(Number(port)) && Number(port) > 0 ? Number(port) : 80
  const cmd = `wget -q -O /dev/null http://127.0.0.1:${safePort}/ 2>/dev/null || curl -fsS -o /dev/null http://127.0.0.1:${safePort}/ 2>/dev/null`
  try {
    execFileSync('docker', ['exec', containerName, 'sh', '-c', cmd], {
      stdio: 'ignore',
      timeout: 5000
    })
    return true
  } catch {
    return false
  }
}

const printContainerLogs = (containerName) => {
  try {
    const logs = execFileSync('docker', ['logs', containerName, '--tail', '40'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (logs && logs.trim()) {
      console.error(`--- docker logs ${containerName} (last 40 lines) ---\n${logs.trim()}`)
    }
  } catch {
    // Container may not exist on this runner
  }
}

const readDockerHostName = () => {
  try {
    return execFileSync('docker', ['info', '--format', '{{.Name}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000
    }).trim()
  } catch {
    return ''
  }
}

const readContainerIndexHtml = (containerName) => {
  try {
    return execFileSync('docker', ['exec', containerName, 'cat', '/usr/share/nginx/html/index.html'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    })
  } catch {
    return ''
  }
}

const main = async () => {
  const containerName = String(process.env.HC_CONTAINER || process.argv[2] || '').trim()
  const inputUrl = String(process.env.HC_URL || process.argv[3] || '').trim()
  const requireExternal = parseBooleanFlag(process.env.HC_REQUIRE_EXTERNAL, true)
  const verifyStaticParity = parseBooleanFlag(process.env.HC_VERIFY_STATIC_PARITY, true)
  const retries = Math.max(1, Number(process.env.HC_RETRIES || DEFAULT_HEALTHCHECK_RETRIES))
  const intervalMs = Math.max(0, Number(process.env.HC_INTERVAL_SEC || DEFAULT_HEALTHCHECK_INTERVAL_MS / 1000) * 1000)
  const timeoutMs = Math.max(1000, Number(process.env.HC_TIMEOUT_SEC || DEFAULT_HEALTHCHECK_TIMEOUT_MS / 1000) * 1000)
  const internalPort = Number(process.env.HC_INTERNAL_PORT || 80)
  const expectedStatuses = parseExpectedStatuses(process.env.HC_EXPECTED_STATUS || DEFAULT_HEALTHY_STATUSES)
  const runnerName = String(process.env.RUNNER_NAME || '').trim()
  const dockerHost = readDockerHostName()

  const externalUrl = resolveHealthcheckUrl({ inputUrl, packageJsonPath: 'package.json' })
  console.log(
    `🔍 [healthcheck] Starting dual-layer verification for container "${containerName || '(none)'}"` +
      `${runnerName ? ` on runner "${runnerName}"` : ''}` +
      `${dockerHost ? ` [dockerHost=${dockerHost}]` : ''}` +
      `${externalUrl ? ` (external: ${externalUrl}, requireExternal=${requireExternal}, staticParity=${verifyStaticParity})` : ' (no external URL)'}...`
  )

  let containerRunning = false
  let internalOk = false
  let localIndexHtml = ''

  if (containerName) {
    const phase1Attempts = Math.min(retries, 5)
    for (let i = 1; i <= phase1Attempts; i += 1) {
      containerRunning = isContainerRunning(containerName)
      if (containerRunning) {
        internalOk = probeContainerInternalHttp(containerName, internalPort)
        if (internalOk || externalUrl) break
      }
      if (i < phase1Attempts) {
        console.log(`⏳ [healthcheck] Waiting for container "${containerName}" readiness (${i}/${phase1Attempts})...`)
        await sleep(intervalMs)
      }
    }
    if (containerRunning) {
      if (verifyStaticParity) {
        localIndexHtml = readContainerIndexHtml(containerName)
      }
      console.log(
        internalOk
          ? `✅ [healthcheck] Phase 1 passed: container "${containerName}" running & 127.0.0.1:${internalPort} HTTP 200.`
          : `ℹ️ [healthcheck] Phase 1: container "${containerName}" is running (internal 127.0.0.1:${internalPort} probe not applicable or pending).`
      )
    }
  } else {
    containerRunning = true
  }

  let externalResult = null
  if (containerRunning && externalUrl) {
    externalResult = await probeExternalHealthcheck({
      url: externalUrl,
      retries,
      intervalMs,
      timeoutMs,
      expectedStatuses,
      expectedLocalHtml: localIndexHtml,
      dockerHost,
      logger: console
    })
  }

  const verdict = evaluatePostDeployHealth({
    containerName: containerName || 'service',
    containerRunning,
    internalOk,
    externalUrl,
    externalResult,
    requireExternal
  })

  if (verdict.warning) {
    console.warn(`⚠️ [healthcheck] ${verdict.warning}`)
  }
  if (!verdict.ok) {
    console.error(`❌ [healthcheck] ${verdict.reason}`)
    if (containerName) printContainerLogs(containerName)
    process.exit(1)
  }

  console.log(`✅ [healthcheck] ${verdict.reason}`)
}

main().catch((err) => {
  console.error(`❌ [healthcheck] ${err?.message || err}`)
  process.exit(1)
})
