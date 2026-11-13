import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as publicEntry from '../src/index.mjs'
import {
  parseSemver,
  compareSemver,
  isVersionSatisfied,
  resolveCiRegistryContext,
  isPrivateRegistryUrl,
  extractScopedDependencies,
  checkPackageAvailability,
  waitForAllDependencies,
  patchDockerfileVendorTarballs
} from '../src/waitForDeps.mjs'
import { scanRepositoryForLeaks } from '../src/sanitizeRepo.mjs'
import { buildCliBinaries } from '../src/buildBin.mjs'

describe('ci-workflows — Dependency Readiness Gate (wait-for-deps)', () => {
  it('exports all public helpers cleanly from src/index.mjs', () => {
    assert.equal(typeof publicEntry.parseSemver, 'function')
    assert.equal(typeof publicEntry.compareSemver, 'function')
    assert.equal(typeof publicEntry.isVersionSatisfied, 'function')
    assert.equal(typeof publicEntry.resolveCiRegistryContext, 'function')
    assert.equal(typeof publicEntry.isPrivateRegistryUrl, 'function')
    assert.equal(typeof publicEntry.extractScopedDependencies, 'function')
    assert.equal(typeof publicEntry.checkPackageAvailability, 'function')
    assert.equal(typeof publicEntry.waitForAllDependencies, 'function')
    assert.equal(typeof publicEntry.patchDockerfileVendorTarballs, 'function')
    assert.equal(typeof publicEntry.scanRepositoryForLeaks, 'function')
  })

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
      fs.writeFileSync(
        path.join(tmp, 'clean.js'),
        'export const parse = (token, pat) => [token.slice(0, 3), pat.split("/")];\n'
      )
      const res = scanRepositoryForLeaks(tmp)
      assert.equal(res.clean, true)
      assert.equal(res.scannedCount, 1)

      fs.writeFileSync(
        path.join(tmp, 'leak.js'),
        'console.log(process.env.NPM_TOKEN.slice(0, 4), authToken.slice(0, 6));\n'
      )
      const leakRes = scanRepositoryForLeaks(tmp)
      assert.equal(leakRes.clean, false)
      assert.ok(leakRes.violations.some((v) => v.ruleId === 'SECRET_LOG_SLICING'))
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

  it('resolves scopePrefix, repoOwner, and fallbackRegistryUrl dynamically from .npmrc, CI env, or package.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-deps-ctx-'))
    try {
      fs.writeFileSync(
        path.join(tmp, '.npmrc'),
        '@acme:registry=https://git.example.com/api/packages/acme/npm/\n'
      )
      fs.writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({
          name: 'my-web-app',
          dependencies: {
            '@acme/nano-ui': '^1.2.0',
            vue: '^3.5.13'
          },
          devDependencies: {
            '@acme/utils': '^1.6.0'
          }
        })
      )

      const ctx = resolveCiRegistryContext(tmp, { env: {} })
      assert.equal(ctx.repoOwner, 'acme')
      assert.equal(ctx.scopePrefix, '@acme/')
      assert.equal(ctx.serverOrigin, 'https://git.example.com')
      assert.equal(ctx.fallbackRegistryUrl, 'https://git.example.com/api/packages/acme/npm')

      const deps = extractScopedDependencies(tmp)
      assert.deepEqual(deps, [
        { name: '@acme/nano-ui', range: '^1.2.0' },
        { name: '@acme/utils', range: '^1.6.0' }
      ])

      const envCtx = resolveCiRegistryContext(tmp, {
        env: {
          GITHUB_SERVER_URL: 'https://gitea.internal.example',
          GITHUB_REPOSITORY: 'orgx/service-a'
        }
      })
      assert.equal(envCtx.repoOwner, 'orgx')
      assert.equal(envCtx.serverOrigin, 'https://gitea.internal.example')

      assert.equal(isPrivateRegistryUrl('https://git.example.com/api/packages/acme/npm/pkg'), true)
      assert.equal(isPrivateRegistryUrl('http://gitea:3000/api/packages/acme/npm/pkg'), true)
      assert.equal(isPrivateRegistryUrl('https://registry.npmjs.org/@acme%2fnano-ui'), false)
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
      [{ name: '@acme/utils', range: '^1.2.0' }],
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
    const seenAuthByHost = new Map()
    const fakeFetch = async (url, opts) => {
      const host = new URL(url).host
      seenAuthByHost.set(host, Boolean(opts?.headers?.Authorization))
      const isGitea = String(url).includes('git.example.com')
      if (opts?.method === 'HEAD') {
        // Real Gitea NPM Packages registry returns 405 Method Not Allowed on HEAD for .tgz tarballs
        return { ok: !isGitea, status: isGitea ? 405 : 200 }
      }
      const versions = isGitea
        ? {
            '1.7.9': {
              dist: { tarball: 'https://git.example.com/api/packages/acme/npm/nano-ui-1.7.9.tgz' }
            },
            '1.8.3': {
              dist: { tarball: 'https://git.example.com/api/packages/acme/npm/nano-ui-1.8.3.tgz' }
            }
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

    const directPriv = await checkPackageAvailability('@acme/nano-ui', '^1.8.3', {
      registryUrl: 'https://git.example.com/api/packages/acme/npm',
      authToken: 'test-token',
      fetchImpl: fakeFetch
    })
    assert.equal(directPriv.available, true)
    assert.equal(seenAuthByHost.get('git.example.com'), true)

    const res = await waitForAllDependencies(
      [{ name: '@acme/nano-ui', range: '^1.8.3' }],
      {
        timeoutMs: 5000,
        pollIntervalMs: 10,
        fallbackRegistryUrl: 'https://git.example.com/api/packages/acme/npm',
        fetchImpl: fakeFetch,
        sleepImpl: async () => {},
        logger: { log: () => {} }
      }
    )

    assert.equal(res.ok, true)
    assert.equal(res.attempts, 1)
    assert.equal(res.resolved[0].matchedVersion, '1.8.3')
    assert.equal(seenAuthByHost.get('registry.npmjs.org'), false)
  })

  it('validates shell syntax (-n) and embedded node -e JS syntax of all run blocks in reusable workflows and executes OSS Sanitization Gate cleanly', async () => {
    const { execFileSync, spawnSync } = await import('node:child_process')
    const vm = await import('node:vm')
    const shellBin = spawnSync('bash', ['--version']).status === 0 ? 'bash' : 'sh'
    const rootDir = path.resolve(import.meta.dirname, '..')
    const workflowFiles = [
      '.gitea/workflows/deploy.yml',
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

    let verifiedNodeBlocks = 0
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

        // Also parse every embedded single-quoted `node -e '...'` script with V8 vm.Script
        for (const nodeMatch of script.matchAll(/node -e '([\s\S]*?)'/g)) {
          // eslint-disable-next-line no-new
          new vm.Script(nodeMatch[1], { filename: `${rel}#inline-node` })
          verifiedNodeBlocks++
        }
      }
    }
    assert.ok(verifiedNodeBlocks >= 10, `Expected >= 10 inline node -e blocks, got ${verifiedNodeBlocks}`)

    // Execute the first run block (OSS Sanitization Gate) of publish-package.yml
    const publishYml = fs.readFileSync(
      path.join(rootDir, '.gitea/workflows/publish-package.yml'),
      'utf8'
    )
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

    // Verify both publish-package.yml and zero-downtime-deploy.yml accept dynamic zero-knowledge inputs
    const deployYml = fs.readFileSync(
      path.join(rootDir, '.gitea/workflows/zero-downtime-deploy.yml'),
      'utf8'
    )
    for (const inputName of [
      'gitea_owner:',
      'package_scope:',
      'private_registry_url:',
      'internal_packages:'
    ]) {
      assert.ok(publishYml.includes(inputName), `Missing ${inputName} in publish-package.yml`)
      assert.ok(deployYml.includes(inputName), `Missing ${inputName} in zero-downtime-deploy.yml`)
    }

    // Verify zero-downtime-deploy.yml picks highest SemVer across registries and supports .yml/.yaml self-heal workflows
    assert.match(deployYml, /cmp\(b\.version,\s*a\.version\)/)
    assert.match(deployYml, /b\.prio\s*-\s*a\.prio/)
    for (const wfName of [
      'publish.yml',
      'publish.yaml',
      'build.yml',
      'build.yaml',
      'deploy.yml',
      'deploy.yaml'
    ]) {
      assert.ok(deployYml.includes(`"${wfName}"`), `Missing ${wfName} in triggerUpstreamSelfHeal`)
    }

    // Verify nginx -s reload closes stdin & stdout/stderr pipes to prevent 3h act_runner hangs
    assert.match(deployYml, /nginx -s reload <\/dev\/null >\/dev\/null 2>&1/)

    // Verify publish-package.yml restores raw package.json & .npmrc immediately after npm install (before npm test & npm run build)
    const installIdx = publishYml.indexOf('execSync("npm install --no-package-lock"')
    const preTestRestoreIdx = publishYml.indexOf('fs.writeFileSync("package.json", rawPkg)', installIdx)
    const runTestIdx = publishYml.indexOf('execSync("npm test"', installIdx)
    const runBuildIdx = publishYml.indexOf('execSync("npm run build"', installIdx)
    assert.ok(
      installIdx > 0 && preTestRestoreIdx > installIdx && preTestRestoreIdx < runTestIdx && preTestRestoreIdx < runBuildIdx,
      'publish-package.yml must restore original package.json immediately after npm install and strictly before npm test / npm run build'
    )
  })

  it('enforces Public OSS Zero-Leak invariant across all workflows, actions, CLI sources, UI, and README', () => {
    const rootDir = path.resolve(import.meta.dirname, '..')
    const publicFiles = [
      '.gitea/workflows/deploy.yml',
      '.gitea/workflows/publish-package.yml',
      '.gitea/workflows/zero-downtime-deploy.yml',
      '.gitea/workflows/git-mirror-sync.yml',
      '.gitea/workflows/trigger-downstream.yml',
      '.gitea/workflows/scheduled-container-job.yml',
      'wait-for-deps/action.yml',
      'publish-npm-dual/action.yml',
      'zero-downtime-swap/action.yml',
      'oss-sanitize-gate/action.yml',
      'src/waitForDeps.mjs',
      'src/buildBin.mjs',
      'src/sanitizeRepo.mjs',
      'src/index.mjs',
      'bin/wait-for-deps.mjs',
      'bin/sanitize-check.mjs',
      'ui/App.vue',
      'README.md'
    ]

    const forbiddenLiterals = [
      'UNSCOPED_INTERNAL_PKGS',
      'i18n-scroll-restore',
      'vue-url-cleaner',
      'vue-minisearch',
      'social-links',
      'science-blog',
      'virtual-keyboard',
      'fuel-index',
      'mem-index',
      'music-app',
      'dashboard-app',
      'blog-engine',
      'gitea.7u.pl',
      'ci.7u.pl',
      '7u.pl'
    ]

    const hits = []
    for (const rel of publicFiles) {
      const content = fs.readFileSync(path.join(rootDir, rel), 'utf8')
      for (const token of forbiddenLiterals) {
        if (content.includes(token)) {
          hits.push(`${rel}: contains forbidden internal identifier "${token}"`)
        }
      }
      // Outside ui/App.vue's real @gkucmierz/nano-ui component import, only ci-workflows's own identity may appear
      const stripped = content
        .replace("import { NanoSwitch, NanoSelect } from '@gkucmierz/nano-ui'", '')
        .replaceAll('@gkucmierz/ci-workflows', '')
        .replaceAll('gkucmierz/ci-workflows', '')
      if (stripped.includes('@gkucmierz/')) {
        hits.push(`${rel}: contains hardcoded @gkucmierz/ scope outside @gkucmierz/ci-workflows`)
      }
    }

    assert.deepEqual(hits, [])
  })

  it('should patch both single-root SPA Dockerfiles and multi-directory fullstack Dockerfiles (ui/server/crawler) with exact vendor-tarballs paths', () => {
    const spaDockerfile = [
      'FROM node:22-alpine AS builder',
      'WORKDIR /app',
      'COPY package*.json .npmrc* ./',
      'RUN npm ci',
      'COPY . .',
      'RUN npm run build'
    ].join('\n')

    const patchedSpa = patchDockerfileVendorTarballs(spaDockerfile, 'Dockerfile', ['.'])
    assert.ok(patchedSpa.includes('COPY vendor-tarballs ./vendor-tarballs/\nCOPY package*.json .npmrc* ./'))
    assert.ok(patchedSpa.includes('RUN npm install'))
    assert.ok(!patchedSpa.includes('npm ci'))

    const fullstackDockerfile = [
      'FROM node:22-alpine AS ui-builder',
      'WORKDIR /app/ui',
      'COPY ui/package*.json ui/.npmrc* .npmrc* ./',
      'RUN npm install --no-package-lock',
      '',
      'FROM node:22-alpine AS runtime',
      'WORKDIR /app',
      'COPY package.json ./',
      'COPY server/package*.json server/.npmrc* .npmrc* ./server/',
      'COPY crawler/package*.json crawler/.npmrc* .npmrc* ./crawler/',
      'RUN npm --prefix server ci --omit=dev'
    ].join('\n')

    // Root '.' has no vendor-tarballs (only 'concurrently'), while ui, server, crawler have vendor-tarballs
    const patchedFullstack = patchDockerfileVendorTarballs(fullstackDockerfile, 'Dockerfile', [
      'ui',
      'server',
      'crawler'
    ])
    assert.ok(
      patchedFullstack.includes('COPY ui/vendor-tarballs ./vendor-tarballs/\nCOPY ui/package*.json'),
      'Injects ui/vendor-tarballs into ui-builder WORKDIR ./'
    )
    assert.ok(
      patchedFullstack.includes(
        'COPY server/vendor-tarballs ./server/vendor-tarballs/\nCOPY server/package*.json'
      ),
      'Injects server/vendor-tarballs into ./server/vendor-tarballs/'
    )
    assert.ok(
      patchedFullstack.includes(
        'COPY crawler/vendor-tarballs ./crawler/vendor-tarballs/\nCOPY crawler/package*.json'
      ),
      'Injects crawler/vendor-tarballs into ./crawler/vendor-tarballs/'
    )
    assert.ok(
      !patchedFullstack.includes('COPY vendor-tarballs ./vendor-tarballs/\nCOPY package.json ./'),
      'Must NOT inject nonexistent root vendor-tarballs when root has no internal deps'
    )
    assert.ok(
      patchedFullstack.includes('RUN npm --prefix server install --omit=dev'),
      'Rewrites npm --prefix <dir> ci to install'
    )
  })
})
