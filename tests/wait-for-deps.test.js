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
import { buildCliBinaries } from '../src/buildBin.mjs'

describe('ci-workflows — Dependency Readiness Gate (wait-for-deps)', () => {
  it('builds CLI binaries into bin/ dynamically via buildCliBinaries (prepack / build)', () => {
    const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-workflows-bin-'))
    try {
      const { waitBinPath, sanitizeBinPath } = buildCliBinaries(tmpBin)
      assert.equal(fs.existsSync(waitBinPath), true)
      assert.equal(fs.existsSync(sanitizeBinPath), true)
      assert.match(fs.readFileSync(waitBinPath, 'utf8'), /^#!\/usr\/bin\/env node/)
      assert.match(fs.readFileSync(sanitizeBinPath, 'utf8'), /^#!\/usr\/bin\/env node/)
    } finally {
      fs.rmSync(tmpBin, { recursive: true, force: true })
    }
  })
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
        fallbackRegistryUrl: null,
        fetchImpl: fakeFetch,
        sleepImpl: async () => {},
        logger: { log: () => {} }
      }
    )

    assert.equal(res.ok, true)
    assert.equal(res.attempts, 3)
    assert.equal(res.resolved[0].matchedVersion, '1.2.0')
  })

  it('resolves immediately from Gitea Packages fallback when npmjs only has an older version (even when Gitea returns HTTP 405 on HEAD)', async () => {
    const fakeFetch = async (url, opts) => {
      const isGitea = String(url).includes('gitea.7u.pl')
      if (opts?.method === 'HEAD') {
        // Real Gitea NPM Packages registry returns 405 Method Not Allowed on HEAD for .tgz tarballs
        return { ok: !isGitea, status: isGitea ? 405 : 200 }
      }
      const versions = isGitea
        ? {
            '1.7.9': { dist: { tarball: 'https://gitea.7u.pl/nano-ui-1.7.9.tgz' } },
            '1.8.3': { dist: { tarball: 'https://gitea.7u.pl/nano-ui-1.8.3.tgz' } }
          }
        : {
            '1.7.9': { dist: { tarball: 'https://registry.npmjs.org/nano-ui-1.7.9.tgz' } }
          }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': { latest: isGitea ? '1.8.3' : '1.7.9' },
          versions
        })
      }
    }

    const res = await waitForAllDependencies(
      [{ name: '@gkucmierz/nano-ui', range: '^1.8.3' }],
      {
        timeoutMs: 5000,
        pollIntervalMs: 10,
        fetchImpl: fakeFetch,
        sleepImpl: async () => {},
        logger: { log: () => {} }
      }
    )

    assert.equal(res.ok, true)
    assert.equal(res.attempts, 1)
    assert.equal(res.resolved[0].matchedVersion, '1.8.3')
  })

  it('validates shell syntax (-n) of all run blocks in reusable workflows and executes OSS Sanitization Gate cleanly (including inside node:22-alpine without bash)', async () => {
    const { execFileSync, spawnSync } = await import('node:child_process')
    const shellBin = spawnSync('bash', ['--version']).status === 0 ? 'bash' : 'sh'
    const rootDir = path.resolve(import.meta.dirname, '..')
    const workflowFiles = [
      '.gitea/workflows/publish-package.yml',
      '.gitea/workflows/git-mirror-sync.yml',
      '.gitea/workflows/zero-downtime-deploy.yml',
      '.gitea/workflows/scheduled-container-job.yml',
      '.gitea/workflows/trigger-downstream.yml',
      'oss-sanitize-gate/action.yml',
      'publish-npm-dual/action.yml',
      'wait-for-deps/action.yml',
      'zero-downtime-swap/action.yml'
    ]

    for (const rel of workflowFiles) {
      const content = fs.readFileSync(path.join(rootDir, rel), 'utf8')
      const runBlocks = [...content.matchAll(/run:\s*\|\n((?:(?:[ ]{8,}.*|[ ]*)\n?)+)/g)]
      assert.ok(runBlocks.length > 0, `Expected at least one run block in ${rel}`)
      for (const match of runBlocks) {
        const lines = match[1].split('\n')
        const minIndent = Math.min(
          ...lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^[ ]*/)[0].length)
        )
        const script = lines
          .map((l) => l.slice(minIndent))
          .join('\n')
          .replace(/\$\{\{[^}]+\}\}/g, 'dummy_val')
        // Verify shell syntax has no unescaped quotes or unexpected tokens
        execFileSync(shellBin, ['-n', '-c', script], { encoding: 'utf8' })
      }
    }

    // Also execute the first run block (OSS Sanitization Gate) of publish-package.yml
    const publishYml = fs.readFileSync(path.join(rootDir, '.gitea/workflows/publish-package.yml'), 'utf8')
    const firstRunMatch = publishYml.match(/run:\s*\|\n((?:[ ]{10,}.*\n?)+)/)
    const sanitizeScript = firstRunMatch[1]
      .split('\n')
      .map((l) => l.slice(10))
      .join('\n')
    const out = execFileSync(shellBin, ['-e', '-c', sanitizeScript], {
      cwd: rootDir,
      encoding: 'utf8'
    })
    assert.match(out, /\[oss-sanitize-gate\] Clean/)
  })
})
