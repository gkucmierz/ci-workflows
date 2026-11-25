import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as publicEntry from '../src/index.mjs'
import {
  DEFAULT_HEALTHY_STATUSES,
  parseExpectedStatuses,
  parseBooleanFlag,
  resolveHealthcheckUrl,
  classifyHealthcheckFailure,
  probeExternalHealthcheck,
  evaluatePostDeployHealth
} from '../src/healthcheck.mjs'
import { buildCliBinaries } from '../src/buildBin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

describe('ci-workflows — Dual-Layer Post-Deploy Healthcheck (Internal + External URL)', () => {
  it('exports all healthcheck helpers from src/index.mjs and builds bin/post-deploy-healthcheck.mjs', () => {
    assert.equal(Boolean(publicEntry.parseExpectedStatuses && publicEntry.parseExpectedStatuses.call), true)
    assert.equal(Boolean(publicEntry.parseBooleanFlag && publicEntry.parseBooleanFlag.call), true)
    assert.equal(Boolean(publicEntry.resolveHealthcheckUrl && publicEntry.resolveHealthcheckUrl.call), true)
    assert.equal(Boolean(publicEntry.classifyHealthcheckFailure && publicEntry.classifyHealthcheckFailure.call), true)
    assert.equal(Boolean(publicEntry.probeExternalHealthcheck && publicEntry.probeExternalHealthcheck.call), true)
    assert.equal(Boolean(publicEntry.evaluatePostDeployHealth && publicEntry.evaluatePostDeployHealth.call), true)

    const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-workflows-hc-bin-'))
    try {
      const { healthcheckBinPath } = buildCliBinaries(tmpBin)
      assert.equal(fs.existsSync(healthcheckBinPath), true)
      const content = fs.readFileSync(healthcheckBinPath, 'utf8')
      assert.match(content, /^#!\/usr\/bin\/env node/)
      assert.match(content, /probeExternalHealthcheck/)
      assert.match(content, /evaluatePostDeployHealth/)
    } finally {
      fs.rmSync(tmpBin, { recursive: true, force: true })
    }
  })

  it('parses expected HTTP status lists, boolean flags, and resolves explicit or package.json homepage URL', () => {
    const defSet = parseExpectedStatuses()
    for (const s of DEFAULT_HEALTHY_STATUSES) {
      assert.equal(defSet.has(s), true)
    }
    const customSet = parseExpectedStatuses('200, 204, 401, invalid, 999')
    assert.deepEqual([...customSet], [200, 204, 401])

    assert.equal(parseBooleanFlag('false', true), false)
    assert.equal(parseBooleanFlag('0', true), false)
    assert.equal(parseBooleanFlag('true', false), true)
    assert.equal(parseBooleanFlag('', true), true)

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-workflows-hc-url-'))
    try {
      const pkgPath = path.join(tmp, 'package.json')
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-web-app', homepage: 'https://app.example.com/' }))

      assert.equal(
        resolveHealthcheckUrl({ inputUrl: 'https://override.example.com/health', packageJsonPath: pkgPath }),
        'https://override.example.com/health'
      )
      assert.equal(
        resolveHealthcheckUrl({ inputUrl: '', packageJsonPath: pkgPath }),
        'https://app.example.com/'
      )
      assert.equal(
        resolveHealthcheckUrl({ inputUrl: '', packageJsonPath: path.join(tmp, 'missing.json') }),
        ''
      )
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('classifies 502/503/504, 525/526, 521-524, 404, and network errors with actionable root-cause hints', () => {
    assert.match(
      classifyHealthcheckFailure({ status: 502, url: 'https://app.example.com/' }),
      /HTTP 502.*reverse proxy.*runs-on/i
    )
    assert.match(
      classifyHealthcheckFailure({ status: 525, url: 'https://app.example.com/' }),
      /HTTP 525.*TLS\/SSL/i
    )
    assert.match(
      classifyHealthcheckFailure({ status: 522, url: 'https://app.example.com/' }),
      /HTTP 522.*DNS/i
    )
    assert.match(
      classifyHealthcheckFailure({ status: 404, url: 'https://app.example.com/health' }),
      /HTTP 404.*Not Found/i
    )
    assert.match(
      classifyHealthcheckFailure({ status: 0, error: 'ECONNREFUSED', url: 'https://app.example.com/' }),
      /Network\/TLS error.*ECONNREFUSED/i
    )
    assert.match(
      classifyHealthcheckFailure({ status: 0, error: 'ECONNREFUSED', url: 'http://localhost:30172/' }),
      /expose-only networking.*docker-compose\.yml/i
    )
  })

  it('retries transient 502 during proxy reload and passes once origin returns HTTP 200', async () => {
    let calls = 0
    const statuses = [502, 502, 200]
    const fakeFetch = async () => ({
      status: statuses[Math.min(calls++, statuses.length - 1)],
      headers: { get: () => '' }
    })

    const res = await probeExternalHealthcheck({
      url: 'https://app.example.com/',
      retries: 5,
      intervalMs: 0,
      fetchImpl: fakeFetch,
      sleepImpl: async () => {},
      logger: { log: () => {} }
    })

    assert.equal(res.ok, true)
    assert.equal(res.status, 200)
    assert.equal(res.attempts, 3)
  })

  it('fails cleanly on persistent HTTP 502 / 525 / network errors and never treats 5xx as healthy', async () => {
    const res502 = await probeExternalHealthcheck({
      url: 'https://app.example.com/',
      retries: 3,
      intervalMs: 0,
      fetchImpl: async () => ({ status: 502, headers: { get: () => '' } }),
      sleepImpl: async () => {},
      logger: { log: () => {} }
    })
    assert.equal(res502.ok, false)
    assert.equal(res502.status, 502)
    assert.equal(res502.attempts, 3)
    assert.match(res502.diagnosis, /HTTP 502/)

    const resNet = await probeExternalHealthcheck({
      url: 'https://app.example.com/',
      retries: 2,
      intervalMs: 0,
      fetchImpl: async () => {
        throw new Error('fetch failed')
      },
      sleepImpl: async () => {},
      logger: { log: () => {} }
    })
    assert.equal(resNet.ok, false)
    assert.equal(resNet.status, 0)
    assert.match(resNet.diagnosis, /fetch failed/)
  })

  it('CRITICAL: internal container HTTP 200 MUST NEVER mask an external HTTP 502 failure', () => {
    // Regression case: container runs & serves 127.0.0.1:80 (e.g. on wrong runner), while public URL returns 502
    const blocked = evaluatePostDeployHealth({
      containerName: 'my-web-app',
      containerRunning: true,
      internalOk: true,
      externalUrl: 'https://app.example.com/',
      externalResult: {
        ok: false,
        status: 502,
        diagnosis: classifyHealthcheckFailure({ status: 502, url: 'https://app.example.com/' })
      },
      requireExternal: true
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.phase, 'external')
    assert.match(blocked.reason, /HTTP 502/)

    // Non-blocking opt-out (require_external_healthcheck: false) logs warning instead of failing
    const warnOnly = evaluatePostDeployHealth({
      containerName: 'my-web-app',
      containerRunning: true,
      internalOk: true,
      externalUrl: 'https://app.example.com/',
      externalResult: { ok: false, status: 502, diagnosis: 'HTTP 502' },
      requireExternal: false
    })
    assert.equal(warnOnly.ok, true)
    assert.equal(warnOnly.phase, 'external-warn')
    assert.match(warnOnly.warning, /require_external_healthcheck=false/)

    // Both internal and external healthy -> PASS
    const healthy = evaluatePostDeployHealth({
      containerName: 'my-web-app',
      containerRunning: true,
      internalOk: true,
      externalUrl: 'https://app.example.com/',
      externalResult: { ok: true, status: 200 },
      requireExternal: true
    })
    assert.equal(healthy.ok, true)
    assert.equal(healthy.phase, 'external')

    // Background worker with no external URL -> PASS when container is running
    const worker = evaluatePostDeployHealth({
      containerName: 'crawler-worker',
      containerRunning: true,
      internalOk: false,
      externalUrl: '',
      externalResult: null,
      requireExternal: true
    })
    assert.equal(worker.ok, true)

    // Stopped/crashed container -> FAIL
    const crashed = evaluatePostDeployHealth({
      containerName: 'my-web-app',
      containerRunning: false,
      internalOk: false,
      externalUrl: 'https://app.example.com/',
      externalResult: null,
      requireExternal: true
    })
    assert.equal(crashed.ok, false)
    assert.equal(crashed.phase, 'container')
  })

  it('zero-downtime-swap/action.yml and zero-downtime-deploy.yml both enforce dual-layer verification without short-circuiting external URL', () => {
    const swapYml = fs.readFileSync(path.join(ROOT, 'zero-downtime-swap', 'action.yml'), 'utf8')
    const deployYml = fs.readFileSync(path.join(ROOT, '.gitea', 'workflows', 'zero-downtime-deploy.yml'), 'utf8')

    assert.match(swapYml, /post-deploy-healthcheck\.mjs/)
    assert.match(swapYml, /require_external_healthcheck/)
    assert.doesNotMatch(
      swapYml,
      /Smoke test passed via internal container probe[\s\S]{0,80}break/,
      'zero-downtime-swap must not short-circuit external URL probe after internal 200'
    )

    assert.match(deployYml, /require_external_healthcheck/)
    assert.match(deployYml, /Phase 2 passed: external/)
    assert.doesNotMatch(
      deployYml,
      /Smoke test passed via internal container probe[\s\S]{0,80}exit 0/,
      'zero-downtime-deploy.yml must not exit 0 on internal 200 before verifying external healthcheck_url'
    )
  })

  it('forbids dynamic runs-on: ${{ inputs.* }} expressions in all reusable workflows (prevents Gitea empty-label runner drift)', () => {
    const wfDir = path.join(ROOT, '.gitea', 'workflows')
    const files = fs.readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    assert.ok(files.length >= 5, 'Expected reusable workflow YAML files in .gitea/workflows')

    for (const file of files) {
      const content = fs.readFileSync(path.join(wfDir, file), 'utf8')
      assert.doesNotMatch(
        content,
        /^\s*runs-on:\s*\$\{\{\s*inputs\./m,
        `${file} must use a static runs-on label instead of dynamic inputs.* (Gitea workflow_call drops dynamic runs-on to empty labels)`
      )
    }

    const deployYml = fs.readFileSync(path.join(wfDir, 'zero-downtime-deploy.yml'), 'utf8')
    assert.match(deployYml, /^\s*runs-on:\s*self-hosted-pl\s*$/m)
    assert.match(deployYml, /REQUESTED_RUNNER=/)
    assert.match(deployYml, /\[RUNNER-NODE-GUARD\]/)

    const swapAction = fs.readFileSync(path.join(ROOT, 'zero-downtime-swap', 'action.yml'), 'utf8')
    assert.match(swapAction, /expected_runner_node:/)
    assert.match(swapAction, /\[RUNNER-NODE-GUARD\]/)
  })
})
