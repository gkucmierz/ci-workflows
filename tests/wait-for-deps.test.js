import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseSemver,
  compareSemver,
  isVersionSatisfied,
  extractScopedDependencies,
  waitForAllDependencies
} from '../src/waitForDeps.mjs'
import { scanRepositoryForLeaks } from '../src/sanitizeRepo.mjs'

describe('ci-workflows — Dependency Readiness Gate (wait-for-deps)', () => {
  it('scans non-git directories (e.g. inside node:22-alpine Docker build context) without throwing git ENOENT', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-nogit-'))
    try {
      fs.writeFileSync(path.join(tmp, 'clean.js'), 'export const x = 42;\n')
      const res = scanRepositoryForLeaks(tmp)
      assert.equal(res.clean, true)
      assert.equal(res.scannedCount, 1)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
  it('parses and compares SemVer ranges accurately (^, ~, >=, exact)', () => {
    assert.deepEqual(parseSemver('^1.2.0'), { major: 1, minor: 2, patch: 0 })
    assert.equal(compareSemver('1.2.0', '1.1.9'), 1)
    assert.equal(compareSemver('1.2.0', '1.2.0'), 0)
    assert.equal(compareSemver('1.1.0', '1.2.0'), -1)

    assert.equal(isVersionSatisfied('1.1.0', '^1.2.0'), false)
    assert.equal(isVersionSatisfied('1.2.0', '^1.2.0'), true)
    assert.equal(isVersionSatisfied('1.3.5', '^1.2.0'), true)
    assert.equal(isVersionSatisfied('2.0.0', '^1.2.0'), false)
    assert.equal(isVersionSatisfied('1.2.4', '~1.2.0'), true)
    assert.equal(isVersionSatisfied('1.3.0', '~1.2.0'), false)
  })

  it('extracts @gkucmierz/* dependencies from package.json and sub-packages', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-deps-test-'))
    try {
      fs.writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@gkucmierz/blog-engine': '^1.2.0',
            vue: '^3.5.13'
          },
          devDependencies: {
            '@gkucmierz/dport': '^1.6.0'
          }
        })
      )
      const deps = extractScopedDependencies(tmp)
      assert.deepEqual(deps, [
        { name: '@gkucmierz/blog-engine', range: '^1.2.0' },
        { name: '@gkucmierz/dport', range: '^1.6.0' }
      ])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('polls asynchronously when package version is not yet published and resolves once published', async () => {
    let fetchCalls = 0
    const fakeFetch = async (url, opts) => {
      if (opts?.method === 'HEAD') {
        return { ok: true, status: 200 }
      }
      fetchCalls++
      // First 2 attempts return only 1.1.0; 3rd attempt includes newly published 1.2.0
      const versions =
        fetchCalls < 3
          ? { '1.1.0': { dist: { tarball: 'https://registry.npmjs.org/t-1.1.0.tgz' } } }
          : {
              '1.1.0': { dist: { tarball: 'https://registry.npmjs.org/t-1.1.0.tgz' } },
              '1.2.0': { dist: { tarball: 'https://registry.npmjs.org/t-1.2.0.tgz' } }
            }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': { latest: fetchCalls < 3 ? '1.1.0' : '1.2.0' },
          versions
        })
      }
    }

    const res = await waitForAllDependencies(
      [{ name: '@gkucmierz/blog-engine', range: '^1.2.0' }],
      {
        timeoutMs: 5000,
        pollIntervalMs: 10,
        fetchImpl: fakeFetch,
        sleepImpl: async () => {},
        logger: { log: () => {} }
      }
    )

    assert.equal(res.ok, true)
    assert.equal(res.attempts, 3)
    assert.equal(res.resolved[0].matchedVersion, '1.2.0')
  })
})
