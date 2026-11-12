<script setup>
import { ref, computed } from 'vue'
import { NanoSwitch, NanoSelect } from '@gkucmierz/nano-ui'
import pkg from '../package.json'

const appVersion = pkg.version || '1.0.0'
const lang = ref('pl')
const activeArchetypeId = ref('zero-downtime-deploy')
const copiedKey = ref('')

const runsOnOptions = [
  {
    value: 'self-hosted-pl',
    labelPl: 'self-hosted-pl (Węzeł PL)',
    labelEn: 'self-hosted-pl (PL Node)',
    badge: 'PL',
    color: '#10b981'
  },
  {
    value: 'self-hosted-de',
    labelPl: 'self-hosted-de (Węzeł DE)',
    labelEn: 'self-hosted-de (DE Node)',
    badge: 'DE',
    color: '#38bdf8'
  }
]

// Interactive configurator state
const cfg = ref({
  containerName: 'my-web-app',
  runsOn: 'self-hosted-pl',
  hotSwapStatic: true,
  healthcheckUrl: 'http://localhost:3000/',
  waitTimeoutSec: 180,
  publishNpmjs: true,
  publishPrivate: true,
  ossSanitizeCheck: true,
  targetRemoteUrl: 'https://github.com/acme/my-web-app.git',
  targetBranch: 'main',
  commandScheduled: 'node --experimental-sqlite crawler/src/run.js --scheduled',
  commandManual: 'node --experimental-sqlite crawler/src/run.js',
  targetRepos: 'acme/web-app,acme/docs-site',
  workflowFile: 'deploy.yml'
})

// Tri-state (indeterminate) master switch for publish-package gates
const publishGatesAllOn = computed(
  () => cfg.value.publishNpmjs && cfg.value.publishPrivate && cfg.value.ossSanitizeCheck
)
const publishGatesIndeterminate = computed(() => {
  const count =
    Number(cfg.value.publishNpmjs) +
    Number(cfg.value.publishPrivate) +
    Number(cfg.value.ossSanitizeCheck)
  return count > 0 && count < 3
})
function toggleAllPublishGates(nextVal) {
  const target = Boolean(nextVal)
  cfg.value.publishNpmjs = target
  cfg.value.publishPrivate = target
  cfg.value.ossSanitizeCheck = target
}

const uiText = computed(() =>
  lang.value === 'pl'
    ? {
        zeroDeps: '0 Zależności Runtime',
        brandSub:
          'Deterministyczne SSoT CI/CD bez halucynacji • Gitea Actions & GitHub Actions • CLI na NPM',
        copyCli: 'Kopiuj CLI',
        copied: 'Skopiowano ✓',
        heroTag1: 'BEZPRZESTOJOWY HOT-SWAP NGINX (0 ms)',
        heroTag2: 'BRAMKA GOTOWOŚCI ZALEŻNOŚCI (WAIT-FOR-DEPS)',
        heroTag3: 'STRAŻNIK OPSEC & ANTI-TOKEN-SLICING',
        heroHeading:
          'Koniec z halucynowaniem buildów. 5 sprawdzonych archetypów CI/CD dla całego ekosystemu.',
        heroLead:
          'Zamiast utrzymywać dziesiątki ręcznie pisanych skryptów bash i YAML w ponad 60 repozytoriach, @gkucmierz/ci-workflows dostarcza jeden sparametryzowany punkt prawdy (SSoT) dla Gitea Actions, GitHub Actions oraz CLI na npmjs.org. Każdy projekt deklaruje wyłącznie swój archetyp i parametry wejściowe.',
        pillars: [
          {
            num: '0 ms',
            label: 'Przestoju przy wdrożeniu SPA / VitePress',
            desc: 'Nowy obraz buduje się obok działającego kontenera, po czym pliki z /usr/share/nginx/html są atomowo podmieniane bez zmiany adresu IP w sieci npm_public.'
          },
          {
            num: '0 ETARGET',
            label: 'Odporność na wyścigi publikacji w NPM',
            desc: 'Gdy wypychasz jednocześnie bibliotekę @acme/ui-kit i aplikację, bramka wait-for-deps czeka na propagację nowej wersji w rejestrze przed startem docker compose build.'
          },
          {
            num: '13.3 kB',
            label: 'Czysty tarball NPM (.npmignore + files)',
            desc: 'Paczka publikowana na npmjs.org oraz Gitea Packages zawiera wyłącznie lekkie narzędzia CLI i reużywalne akcje — bez kodu tej strony SPA, testów ani plików Docker.'
          }
        ],
        studioEyebrow: 'INTERAKTYWNY KONFIGURATOR WORKFLOWÓW',
        studioTitle: 'Katalog 5 Deterministycznych Archetypów CI/CD',
        configParamsTitle: 'Parametry konfiguracji (with:)',
        copyYaml: 'Kopiuj gotowy workflow',
        copiedYaml: 'Skopiowano YAML ✓',
        tableEyebrow: 'MACIERZ NARZĘDZI CLI I AKCJI KOMPOZYTOWYCH',
        tableTitle: 'Komponenty Paczki @gkucmierz/ci-workflows',
        tableCaption:
          'Zestawienie narzędzi CLI, kompozytowych akcji oraz reużywalnych workflowów w paczce @gkucmierz/ci-workflows',
        colModule: 'Moduł / Narzędzie',
        colType: 'Typ',
        colInvoke: 'Wywołanie (CLI / YAML)',
        colPurpose: 'Zadanie i Gwarancje',
        secEyebrow: 'OPSEC & OCHRONA PRZED CIĘCIEM TOKENÓW',
        secTitle: 'Dlaczego oss-sanitize-check blokuje cięcie i obfuskację tokenów?',
        footerNote:
          'Publikowane na registry.npmjs.org oraz Gitea Packages (czysty tarball przez .npmignore)'
      }
    : {
        zeroDeps: '0 Runtime Deps',
        brandSub:
          'Deterministic Zero-Hallucination CI/CD SSoT • Gitea Actions & GitHub Actions • NPM CLI',
        copyCli: 'Copy CLI',
        copied: 'Copied ✓',
        heroTag1: 'ZERO-DOWNTIME NGINX HOT-SWAP (0 ms)',
        heroTag2: 'DEPENDENCY READINESS GATE (WAIT-FOR-DEPS)',
        heroTag3: 'ANTI-TOKEN-SLICING OPSEC GATE',
        heroHeading:
          'Stop hallucinating builds. 5 battle-tested CI/CD archetypes for the entire ecosystem.',
        heroLead:
          'Instead of maintaining dozens of hand-written bash and YAML scripts across 60+ repositories, @gkucmierz/ci-workflows provides a single parameterized Single Source of Truth (SSoT) for Gitea Actions, GitHub Actions, and npmjs.org CLI.',
        pillars: [
          {
            num: '0 ms',
            label: 'Downtime during SPA / VitePress deploys',
            desc: 'The new Docker image builds alongside the live container, then /usr/share/nginx/html assets are hot-swapped in place without changing the container IP on npm_public.'
          },
          {
            num: '0 ETARGET',
            label: 'Immune to NPM publish race conditions',
            desc: 'When pushing a shared library and an app together, wait-for-deps polls registry.npmjs.org until the required version is live before starting docker compose build.'
          },
          {
            num: '13.3 kB',
            label: 'Clean NPM tarball (.npmignore + files)',
            desc: 'The tarball published to npmjs.org and Gitea Packages contains only the zero-dependency CLI tools and workflow definitions — excluding this SPA site, tests, and Docker files.'
          }
        ],
        studioEyebrow: 'INTERACTIVE WORKFLOW COMPOSER',
        studioTitle: 'Catalog of 5 Deterministic CI/CD Archetypes',
        configParamsTitle: 'Configuration parameters (with:)',
        copyYaml: 'Copy workflow YAML',
        copiedYaml: 'Copied YAML ✓',
        tableEyebrow: 'UNIFIED CLI & COMPOSITE ACTIONS MATRIX',
        tableTitle: 'Components of @gkucmierz/ci-workflows',
        tableCaption:
          'Summary of CLI utilities, composite actions, and reusable workflows in @gkucmierz/ci-workflows',
        colModule: 'Module / Tool',
        colType: 'Type',
        colInvoke: 'Invocation (CLI / YAML)',
        colPurpose: 'Responsibility & Guarantees',
        secEyebrow: 'OPSEC & ANTI-TOKEN-SLICING GUARD',
        secTitle: 'Why oss-sanitize-check blocks token slicing and obfuscation',
        footerNote:
          'Published to registry.npmjs.org & Gitea Packages (Clean Tarball via .npmignore)'
      }
)

const archetypes = computed(() =>
  lang.value === 'pl'
    ? [
        {
          id: 'zero-downtime-deploy',
          num: '01',
          badge: 'WDROŻENIE • 0 ms PRZESTOJU',
          title: 'Zero-Downtime App Deploy',
          file: '.gitea/workflows/zero-downtime-deploy.yml',
          summary:
            'Buduje obraz Docker podczas działania kontenera, czeka w bramce wait-for-deps na publikację zależności wewnętrznych (@scope/*) w NPM, wykonuje atomowy hot-swap statycznych plików Nginx (zachowując IP w sieci npm_public), odświeża DNS w Nginx Proxy Manager i weryfikuje HTTP 200 smoke-test.',
          highlights: [
            'Brak błędów 502 Bad Gateway przy wdrożeniu (zachowane IP kontenera w sieci npm_public)',
            'Bramka gotowości zależności (wait-for-deps) chroni przed błędem ETARGET',
            'Automatyczne przeładowanie resolvera w jc21/nginx-proxy-manager + retry smoke-test'
          ]
        },
        {
          id: 'publish-package',
          num: '02',
          badge: 'NPM + GITEA • PODWÓJNY REJESTR',
          title: 'Dual-Registry Package Publisher',
          file: '.gitea/workflows/publish-package.yml',
          summary:
            'Deterministyczna publikacja bibliotek NPM jednocześnie na publiczne registry.npmjs.org oraz prywatny rejestr Gitea/Gitee. Zawiera bramkę bezpieczeństwa oss-sanitize-gate, auto-detekcję npm test / npm run build oraz idempotentne pomijanie już opublikowanych wersji.',
          highlights: [
            'Skaner Anti-Token-Slicing i wycieków ścieżek hosta przed publikacją (oss-sanitize-gate)',
            'Idempotentne sprawdzenie HTTP 200 w registry.npmjs.org — zero błędów EPUBLISHCONFLICT',
            'Czysty tarball sterowany przez białą listę "files" w package.json oraz .npmignore'
          ]
        },
        {
          id: 'git-mirror-sync',
          num: '03',
          badge: 'MIRROR GIT • STRAŻNIK OPSEC',
          title: 'Git Mirror & Bramka Sanityzacji OSS',
          file: '.gitea/workflows/git-mirror-sync.yml',
          summary:
            'Bezpieczna synchronizacja (mirror push gałęzi i tagów) z prywatnej Gitei na publiczny GitHub, Gitee lub GitLab. Zanim wykona git push, weryfikuje całe drzewo śledzonych plików pod kątem wycieków ścieżek /Users/<user>/, plików .agents oraz pociętych tokenów.',
          highlights: [
            'Twarda blokada wypchnięcia przy wykryciu prywatnych ścieżek lub kluczy kryptograficznych',
            'Obsługa dowolnego zdalnego hosta Git (GitHub, Gitee, GitLab)',
            'Pełna synchronizacja gałęzi docelowej oraz tagów wydań (--tags)'
          ]
        },
        {
          id: 'scheduled-container-job',
          num: '04',
          badge: 'CRON • ZADANIA W KONTENERZE',
          title: 'Cykliczne Zadanie w Kontenerze (Crawler)',
          file: '.gitea/workflows/scheduled-container-job.yml',
          summary:
            'Ujednolicony runner dla cyklicznych zadań cron oraz ręcznych wywołań workflow_dispatch wykonywanych wewnątrz działającego kontenera Docker (np. cykliczne workery i crawlery danych w crawler-worker).',
          highlights: [
            'Weryfikacja stanu kontenera (State.Running) przed wywołaniem docker exec',
            'Automatyczne rozróżnienie uruchomienia z harmonogramu (schedule) od ręcznego (workflow_dispatch)',
            'Zero powielania skryptów bash w poszczególnych repozytoriach'
          ]
        },
        {
          id: 'trigger-downstream',
          num: '05',
          badge: 'KASKADA • WYZWALACZ API',
          title: 'Kaskadowe Wyzwalanie Zależnych Projektów',
          file: '.gitea/workflows/trigger-downstream.yml',
          summary:
            'Po opublikowaniu nowej wersji biblioteki (np. @acme/ui-kit) lub pluginu automatycznie wyzwala przebudowę zależnych aplikacji przez REST API Gitei lub GitHuba.',
          highlights: [
            'Obsługa listy wielu repozytoriów docelowych oddzielonych przecinkami (CSV)',
            'Pełna kontrola błędów HTTP i czytelne logi statusu dla każdego repozytorium',
            'Kompatybilne z API v1 Gitei oraz GitHub Actions dispatches'
          ]
        }
      ]
    : [
        {
          id: 'zero-downtime-deploy',
          num: '01',
          badge: 'DEPLOY • 0ms DOWNTIME',
          title: 'Zero-Downtime App Deploy',
          file: '.gitea/workflows/zero-downtime-deploy.yml',
          summary:
            'Builds the Docker image while the container runs, waits in wait-for-deps for internal @scope/* packages on NPM, performs an atomic Nginx static hot-swap (preserving the npm_public IP), reloads Nginx Proxy Manager DNS, and runs an HTTP 200 smoke test.',
          highlights: [
            'Zero 502 Bad Gateway errors during deploy (container IP on npm_public is preserved)',
            'Pre-build Dependency Readiness Gate (wait-for-deps) prevents ETARGET failures',
            'Automatic resolver reload in jc21/nginx-proxy-manager + retry smoke test'
          ]
        },
        {
          id: 'publish-package',
          num: '02',
          badge: 'NPM + GITEA • DUAL REGISTRY',
          title: 'Dual-Registry Package Publisher',
          file: '.gitea/workflows/publish-package.yml',
          summary:
            'Deterministic NPM library publishing to both public registry.npmjs.org and private Gitea/Gitee Packages. Includes oss-sanitize-gate, auto-detected npm test / npm run build, and idempotent skipping of already-published versions.',
          highlights: [
            'Anti-Token-Slicing & Host-Path Leak scanner before publish (oss-sanitize-gate)',
            'Idempotent HTTP 200 check against registry.npmjs.org — zero EPUBLISHCONFLICT errors',
            'Clean tarball governed by package.json "files" whitelist and .npmignore'
          ]
        },
        {
          id: 'git-mirror-sync',
          num: '03',
          badge: 'GIT MIRROR • OPSEC GUARD',
          title: 'Git Mirror & OSS Sanitization Gate',
          file: '.gitea/workflows/git-mirror-sync.yml',
          summary:
            'Safe synchronization (mirror push of branches and tags) from private Gitea to public GitHub, Gitee, or GitLab after verifying all tracked files with oss-sanitize-gate.',
          highlights: [
            'Hard block on push if private host paths or cryptographic keys are detected',
            'Supports any external Git host (GitHub, Gitee, GitLab)',
            'Full synchronization of target branch and release tags (--tags)'
          ]
        },
        {
          id: 'scheduled-container-job',
          num: '04',
          badge: 'CRON • CONTAINER EXEC',
          title: 'Scheduled Container Job (Crawler)',
          file: '.gitea/workflows/scheduled-container-job.yml',
          summary:
            'Unified runner for scheduled cron jobs and manual workflow_dispatch runs executed inside a live Docker container (e.g. scheduled data workers and crawlers inside crawler-worker).',
          highlights: [
            'Verifies container State.Running before invoking docker exec',
            'Automatically distinguishes cron schedule runs from manual workflow_dispatch',
            'Eliminates duplicated bash scripts across crawler repositories'
          ]
        },
        {
          id: 'trigger-downstream',
          num: '05',
          badge: 'CASCADE • API DISPATCH',
          title: 'Cross-Repo Workflow Dispatch',
          file: '.gitea/workflows/trigger-downstream.yml',
          summary:
            'Automatically triggers rebuilds of dependent applications via Gitea or GitHub REST API after publishing a new version of a shared library or plugin.',
          highlights: [
            'Supports comma-separated lists of target repositories (CSV)',
            'Strict HTTP status verification and clear per-repository dispatch logs',
            'Compatible with Gitea API v1 and GitHub Actions dispatches'
          ]
        }
      ]
)

const activeArchetype = computed(
  () => archetypes.value.find((a) => a.id === activeArchetypeId.value) || archetypes.value[0]
)

const generatedYaml = computed(() => {
  const c = cfg.value
  switch (activeArchetypeId.value) {
    case 'zero-downtime-deploy':
      return `name: Build and Deploy (${c.containerName})

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    uses: gkucmierz/ci-workflows/.gitea/workflows/zero-downtime-deploy.yml@main
    with:
      container_name: ${c.containerName}
      runs_on: ${c.runsOn}
      hot_swap_static: ${c.hotSwapStatic}
      wait_timeout_sec: ${c.waitTimeoutSec}${c.healthcheckUrl ? `\n      healthcheck_url: ${c.healthcheckUrl}` : ''}`

    case 'publish-package':
      return `name: Test, Sanitize & Publish Package

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  publish:
    uses: gkucmierz/ci-workflows/.gitea/workflows/publish-package.yml@main
    with:
      runs_on: ${c.runsOn}
      publish_npmjs: ${c.publishNpmjs}
      publish_private: ${c.publishPrivate}
      oss_sanitize_check: ${c.ossSanitizeCheck}
    secrets:
      NPM_AUTH_TOKEN: \${{ secrets.NPM_AUTH_TOKEN }}
      LOCAL_PACKAGE_REGISTRY: \${{ secrets.LOCAL_PACKAGE_REGISTRY }}`

    case 'git-mirror-sync':
      return `name: Sanitize & Mirror to External Git

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  mirror:
    uses: gkucmierz/ci-workflows/.gitea/workflows/git-mirror-sync.yml@main
    with:
      target_remote_url: ${c.targetRemoteUrl}
      target_branch: ${c.targetBranch}
      runs_on: ${c.runsOn}
      oss_sanitize_check: ${c.ossSanitizeCheck}
    secrets:
      MIRROR_USERNAME: acme
      MIRROR_TOKEN: \${{ secrets.GITHUB_MIRROR_TOKEN }}`

    case 'scheduled-container-job':
      return `name: Scheduled Container Task (${c.containerName})

on:
  schedule:
    - cron: '15 */6 * * *'
  workflow_dispatch:

jobs:
  exec_task:
    uses: gkucmierz/ci-workflows/.gitea/workflows/scheduled-container-job.yml@main
    with:
      container_name: ${c.containerName}
      runs_on: ${c.runsOn}
      command_scheduled: ${c.commandScheduled}
      command_manual: ${c.commandManual}`

    case 'trigger-downstream':
      return `name: Trigger Downstream Dependent Apps

on:
  push:
    branches: [main]

jobs:
  trigger:
    uses: gkucmierz/ci-workflows/.gitea/workflows/trigger-downstream.yml@main
    with:
      target_repos: ${c.targetRepos}
      workflow_file: ${c.workflowFile}
      runs_on: ${c.runsOn}
    secrets:
      DISPATCH_PAT: \${{ secrets.EXTENSION_PAT }}`

    default:
      return ''
  }
})

const cliAndActionsCatalog = computed(() =>
  lang.value === 'pl'
    ? [
        {
          name: 'wait-for-deps',
          kind: 'CLI & Akcja Kompozytowa',
          invocation: 'npx @gkucmierz/ci-workflows wait-for-deps',
          purpose:
            'Odpytuje registry.npmjs.org co 5 s (maks. 180 s), aż wszystkie wymagane wersje paczek @scope/* z package.json (root, ui/, server/, crawler/) będą opublikowane i osiągalne.'
        },
        {
          name: 'oss-sanitize-check',
          kind: 'CLI & Bramka Pre-Publish',
          invocation: 'npx @gkucmierz/ci-workflows oss-sanitize-check',
          purpose:
            'Skanuje wszystkie śledzone przez Git pliki pod kątem ścieżek /Users/<user>/, plików .agents, kluczy PEM, jawnych tokenów API, sklejanych prefiksów (<prefix>_ + ...) oraz cięcia sekretów w logach (<TOKEN>.slice).'
        },
        {
          name: 'oss-sanitize-gate',
          kind: 'Akcja Kompozytowa Gitea / GitHub',
          invocation: 'uses: gkucmierz/ci-workflows/oss-sanitize-gate@main',
          purpose:
            'Uruchamia automatycznie wykryte testy jednostkowe (npm test) oraz skaner bezpieczeństwa oss-sanitize-check jako pojedynczy krok w dowolnym jobie CI.'
        },
        {
          name: 'publish-npm-dual',
          kind: 'Akcja Kompozytowa Gitea / GitHub',
          invocation: 'uses: gkucmierz/ci-workflows/publish-npm-dual@main',
          purpose:
            'Weryfikuje czysty tarball (npm pack --dry-run), sprawdza przez HTTP czy wersja już istnieje na registry.npmjs.org i publikuje paczkę równolegle na npmjs.org oraz Gitea Packages.'
        },
        {
          name: 'zero-downtime-swap',
          kind: 'Akcja Kompozytowa Gitea / GitHub',
          invocation: 'uses: gkucmierz/ci-workflows/zero-downtime-swap@main',
          purpose:
            'Buduje obraz Docker przy działającym kontenerze, podmienia /usr/share/nginx/html przez katalog tymczasowy, wykonuje nginx -s reload (0 ms przestoju), odświeża DNS w Nginx Proxy Manager i sprawdza healthcheck_url.'
        }
      ]
    : [
        {
          name: 'wait-for-deps',
          kind: 'CLI & Composite Action',
          invocation: 'npx @gkucmierz/ci-workflows wait-for-deps',
          purpose:
            'Polls registry.npmjs.org every 5s (up to 180s) until all internal @scope/* versions required by package.json (root, ui/, server/, crawler/) are published and reachable.'
        },
        {
          name: 'oss-sanitize-check',
          kind: 'CLI & Pre-Publish Gate',
          invocation: 'npx @gkucmierz/ci-workflows oss-sanitize-check',
          purpose:
            'Scans all git-tracked files for /Users/<user>/ paths, tracked .agents files, PEM keys, raw API tokens, sliced token prefixes (<prefix>_ + ...), and secret log-slicing (<TOKEN>.slice).'
        },
        {
          name: 'oss-sanitize-gate',
          kind: 'Gitea / GitHub Composite Action',
          invocation: 'uses: gkucmierz/ci-workflows/oss-sanitize-gate@main',
          purpose:
            'Runs auto-detected unit tests (npm test) followed by the oss-sanitize-check OPSEC scanner as a single reusable CI step.'
        },
        {
          name: 'publish-npm-dual',
          kind: 'Gitea / GitHub Composite Action',
          invocation: 'uses: gkucmierz/ci-workflows/publish-npm-dual@main',
          purpose:
            'Verifies clean tarball contents (npm pack --dry-run), checks if the version already exists on registry.npmjs.org, and publishes to both npmjs.org and Gitea Packages.'
        },
        {
          name: 'zero-downtime-swap',
          kind: 'Gitea / GitHub Composite Action',
          invocation: 'uses: gkucmierz/ci-workflows/zero-downtime-swap@main',
          purpose:
            'Builds Docker image while container stays live, copies /usr/share/nginx/html via host staging dir, runs nginx -s reload (0ms downtime), refreshes Nginx Proxy Manager DNS, and checks healthcheck_url.'
        }
      ]
)

const securityRules = computed(() =>
  lang.value === 'pl'
    ? [
        {
          ruleId: 'SLICED_TOKEN_PREFIX',
          title: 'Ochrona przed cięciem i sklejaniem tokenów (Anti-Token-Slicing)',
          desc: 'Wykrywa próby ominięcia skanerów Push Protection / Gitleaks przez rozbijanie prefiksów w kodzie (np. konkatenacja prefiksów ghp_… / npm_… lub sklejanie tablic znaków).'
        },
        {
          ruleId: 'SECRET_LOG_SLICING',
          title: 'Ochrona maskowania sekretów w logach runnera (Mask-Bypass Guard)',
          desc: 'Gitea Actions (act_runner) i GitHub Actions maskują na *** tylko pełny string sekretu. Wywołanie <TOKEN>.slice(0, 8) omija maskowanie i drukuje jawny fragment klucza w logach — skaner blokuje takie konstrukcje.'
        },
        {
          ruleId: 'LOCAL_HOST_PATH',
          title: 'Zakaz lokalnych ścieżek hosta (/Users/<user>/... oraz /home/<user>/...)',
          desc: 'Paczki opublikowane na npmjs.org są niezmienne (immutable). Skaner blokuje publikację, jeśli w jakimkolwiek śledzonym pliku znajduje się ścieżka katalogu domowego autora.'
        },
        {
          ruleId: 'TRACKED_AGENTS_FILE',
          title: 'Blokada wewnętrznych reguł agentowych (.agents/ oraz AGENTS.md)',
          desc: 'Gwarantuje, że lokalne instrukcje i konfiguracje agentów AI nigdy nie trafią do publicznego repozytorium Git ani paczki NPM.'
        }
      ]
    : [
        {
          ruleId: 'SLICED_TOKEN_PREFIX',
          title: 'Anti-Token-Slicing & Concatenation Guard',
          desc: 'Detects attempts to bypass Push Protection / Gitleaks scanners by splitting token prefixes in source code (e.g. concatenating ghp_… / npm_… prefixes or joining character arrays).'
        },
        {
          ruleId: 'SECRET_LOG_SLICING',
          title: 'CI Runner Log Mask-Bypass Guard',
          desc: 'Gitea Actions (act_runner) and GitHub Actions only mask the exact full secret string as ***. Calling <TOKEN>.slice(0, 8) bypasses log masking and prints plaintext key fragments — blocked automatically.'
        },
        {
          ruleId: 'LOCAL_HOST_PATH',
          title: 'Zero Host Directory Leaks (/Users/<user>/... & /home/<user>/...)',
          desc: 'Packages published to npmjs.org are immutable. The scanner blocks publication if any tracked file contains a local home directory path.'
        },
        {
          ruleId: 'TRACKED_AGENTS_FILE',
          title: 'Internal AI Agent Rules Block (.agents/ & AGENTS.md)',
          desc: 'Guarantees that local AI agent instructions and workspace rules are never accidentally pushed to public Git mirrors or NPM tarballs.'
        }
      ]
)

async function copyText(text, key) {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 2000)
  } catch {}
}
</script>

<template>
  <div class="ci-shell">
    <!-- Top Header -->
    <header class="ci-header">
      <div class="ci-header-inner">
        <div class="brand-row">
          <div class="brand-icon-box" aria-hidden="true">
            <svg
              class="brand-bolt-svg"
               width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M13.5 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13.5 2Z"
                fill="url(#boltGrad)"
                stroke="#fde68a"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
              <defs>
                <linearGradient id="boltGrad" x1="4.5" y1="2" x2="19.5" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#fde047" />
                  <stop offset="1" stop-color="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <div class="brand-title-wrap">
              <span class="brand-title">@gkucmierz/ci-workflows</span>
              <span class="version-pill">v{{ appVersion }}</span>
              <span class="zero-deps-pill">{{ uiText.zeroDeps }}</span>
            </div>
            <p class="brand-sub">{{ uiText.brandSub }}</p>
          </div>
        </div>

        <div class="header-right-group">
          <div class="header-install-box">
            <code>npx @gkucmierz/ci-workflows oss-sanitize-check</code>
            <button
              type="button"
              class="copy-mini-btn"
              @click="copyText('npx @gkucmierz/ci-workflows oss-sanitize-check', 'hdr')"
            >
              {{ copiedKey === 'hdr' ? uiText.copied : uiText.copyCli }}
            </button>
          </div>

          <div class="lang-switch" role="group" aria-label="Wybór języka / Language">
            <button
              type="button"
              class="lang-btn"
              :class="{ active: lang === 'pl' }"
              @click="lang = 'pl'"
            >
              PL
            </button>
            <button
              type="button"
              class="lang-btn"
              :class="{ active: lang === 'en' }"
              @click="lang = 'en'"
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="ci-main">
      <!-- Hero Banner -->
      <section class="hero-card">
        <div class="hero-badge-row">
          <span class="hero-tag emerald">{{ uiText.heroTag1 }}</span>
          <span class="hero-tag cyan">{{ uiText.heroTag2 }}</span>
          <span class="hero-tag amber">{{ uiText.heroTag3 }}</span>
        </div>
        <h1 class="hero-heading">{{ uiText.heroHeading }}</h1>
        <p class="hero-lead">{{ uiText.heroLead }}</p>

        <div class="hero-pillars">
          <div v-for="(p, idx) in uiText.pillars" :key="idx" class="pillar-box">
            <div class="pillar-num">{{ p.num }}</div>
            <div class="pillar-label">{{ p.label }}</div>
            <p class="pillar-desc">{{ p.desc }}</p>
          </div>
        </div>
      </section>

      <!-- Interactive 5-Archetype Configurator & Studio -->
      <section class="studio-section" aria-labelledby="studio-heading">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">{{ uiText.studioEyebrow }}</span>
            <h2 id="studio-heading" class="section-title">{{ uiText.studioTitle }}</h2>
          </div>
        </div>

        <div class="archetype-tabs" role="tablist" aria-label="Archetypy Workflowów CI/CD">
          <button
            v-for="arch in archetypes"
            :key="arch.id"
            type="button"
            role="tab"
            :aria-selected="activeArchetypeId === arch.id"
            class="arch-tab-btn"
            :class="{ active: activeArchetypeId === arch.id }"
            @click="activeArchetypeId = arch.id"
          >
            <span class="arch-num">{{ arch.num }}</span>
            <span class="arch-name">{{ arch.title }}</span>
          </button>
        </div>

        <div class="studio-grid">
          <!-- Left: Explanation + Parameter Inputs -->
          <div class="studio-left-card">
            <div class="arch-badge">{{ activeArchetype.badge }}</div>
            <h3 class="arch-card-title">{{ activeArchetype.title }}</h3>
            <code class="arch-file-path">{{ activeArchetype.file }}</code>
            <p class="arch-summary">{{ activeArchetype.summary }}</p>

            <ul class="arch-highlights">
              <li v-for="(item, idx) in activeArchetype.highlights" :key="idx">
                <span class="check-dot">✓</span>
                <span>{{ item }}</span>
              </li>
            </ul>

            <div class="config-form-box">
              <div class="config-form-title">{{ uiText.configParamsTitle }}</div>

              <div v-if="activeArchetypeId === 'zero-downtime-deploy'" class="form-fields">
                <label class="field-label">
                  <span>container_name</span>
                  <input v-model="cfg.containerName" type="text" class="field-input" />
                </label>
                <div class="field-label">
                  <span>runs_on</span>
                  <NanoSelect
                    v-model="cfg.runsOn"
                    :options="runsOnOptions"
                    :searchable="false"
                    size="sm"
                    :lang="lang"
                  />
                </div>
                <label class="field-label">
                  <span>healthcheck_url (Smoke Test)</span>
                  <input v-model="cfg.healthcheckUrl" type="text" class="field-input" />
                </label>
                <div class="field-switch-row">
                  <NanoSwitch
                    v-model="cfg.hotSwapStatic"
                    size="compact"
                    color="cyan"
                    :label="
                      lang === 'pl'
                        ? 'hot_swap_static (true dla SPA/VitePress, false dla backendów Node)'
                        : 'hot_swap_static (true for SPA/VitePress, false for Node backends)'
                    "
                  />
                </div>
              </div>

              <div v-else-if="activeArchetypeId === 'publish-package'" class="form-fields">
                <div class="field-label">
                  <span>runs_on</span>
                  <NanoSelect
                    v-model="cfg.runsOn"
                    :options="runsOnOptions"
                    :searchable="false"
                    size="sm"
                    :lang="lang"
                  />
                </div>
                <div class="field-switch-row field-switch-master">
                  <NanoSwitch
                    :model-value="publishGatesAllOn"
                    :indeterminate="publishGatesIndeterminate"
                    size="compact"
                    color="purple"
                    :label="
                      lang === 'pl'
                        ? 'Wszystkie bramki publikacji (tryb pełny / mieszany indeterminate)'
                        : 'All publish & security gates (full / mixed indeterminate state)'
                    "
                    @update:model-value="toggleAllPublishGates"
                  />
                </div>
                <div class="field-switch-row">
                  <NanoSwitch
                    v-model="cfg.publishNpmjs"
                    size="compact"
                    color="cyan"
                    :label="
                      lang === 'pl'
                        ? 'publish_npmjs (Publikuj na publicznym registry.npmjs.org)'
                        : 'publish_npmjs (Publish to public registry.npmjs.org)'
                    "
                  />
                </div>
                <div class="field-switch-row">
                  <NanoSwitch
                    v-model="cfg.publishPrivate"
                    size="compact"
                    color="cyan"
                    :label="
                      lang === 'pl'
                        ? 'publish_private (Publikuj w prywatnym rejestrze Gitea / Gitee)'
                        : 'publish_private (Publish to private Gitea / Gitee registry)'
                    "
                  />
                </div>
                <div class="field-switch-row">
                  <NanoSwitch
                    v-model="cfg.ossSanitizeCheck"
                    size="compact"
                    color="emerald"
                    :label="
                      lang === 'pl'
                        ? 'oss_sanitize_check (Blokuj przy wykryciu ścieżek /Users/ lub tokenów)'
                        : 'oss_sanitize_check (Block on /Users/ paths or sliced tokens)'
                    "
                  />
                </div>
              </div>

              <div v-else-if="activeArchetypeId === 'git-mirror-sync'" class="form-fields">
                <label class="field-label">
                  <span>target_remote_url</span>
                  <input v-model="cfg.targetRemoteUrl" type="text" class="field-input" />
                </label>
                <label class="field-label">
                  <span>target_branch</span>
                  <input v-model="cfg.targetBranch" type="text" class="field-input" />
                </label>
                <div class="field-label">
                  <span>runs_on</span>
                  <NanoSelect
                    v-model="cfg.runsOn"
                    :options="runsOnOptions"
                    :searchable="false"
                    size="sm"
                    :lang="lang"
                  />
                </div>
                <div class="field-switch-row">
                  <NanoSwitch
                    v-model="cfg.ossSanitizeCheck"
                    size="compact"
                    color="emerald"
                    :label="
                      lang === 'pl'
                        ? 'oss_sanitize_check (Wymagaj czystego skanu OPSEC przed git push)'
                        : 'oss_sanitize_check (Require clean OPSEC scan before git push)'
                    "
                  />
                </div>
              </div>

              <div v-else-if="activeArchetypeId === 'scheduled-container-job'" class="form-fields">
                <label class="field-label">
                  <span>container_name</span>
                  <input v-model="cfg.containerName" type="text" class="field-input" />
                </label>
                <div class="field-label">
                  <span>runs_on</span>
                  <NanoSelect
                    v-model="cfg.runsOn"
                    :options="runsOnOptions"
                    :searchable="false"
                    size="sm"
                    :lang="lang"
                  />
                </div>
                <label class="field-label">
                  <span>command_scheduled</span>
                  <input v-model="cfg.commandScheduled" type="text" class="field-input" />
                </label>
                <label class="field-label">
                  <span>command_manual</span>
                  <input v-model="cfg.commandManual" type="text" class="field-input" />
                </label>
              </div>

              <div v-else-if="activeArchetypeId === 'trigger-downstream'" class="form-fields">
                <label class="field-label">
                  <span>target_repos (CSV)</span>
                  <input v-model="cfg.targetRepos" type="text" class="field-input" />
                </label>
                <label class="field-label">
                  <span>workflow_file</span>
                  <input v-model="cfg.workflowFile" type="text" class="field-input" />
                </label>
                <div class="field-label">
                  <span>runs_on</span>
                  <NanoSelect
                    v-model="cfg.runsOn"
                    :options="runsOnOptions"
                    :searchable="false"
                    size="sm"
                    :lang="lang"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Generated YAML Preview -->
          <div class="studio-right-card">
            <div class="code-card-header">
              <span class="code-filename">.gitea/workflows/deploy.yml</span>
              <button
                type="button"
                class="copy-yaml-btn"
                @click="copyText(generatedYaml, 'yaml')"
              >
                {{ copiedKey === 'yaml' ? uiText.copiedYaml : uiText.copyYaml }}
              </button>
            </div>
            <pre class="yaml-code-block"><code>{{ generatedYaml }}</code></pre>
          </div>
        </div>
      </section>

      <!-- Responsive Reference Table (modern-web-guidance: responsive-table) -->
      <section class="table-section" aria-labelledby="catalog-table-caption">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">{{ uiText.tableEyebrow }}</span>
            <h2 class="section-title">{{ uiText.tableTitle }}</h2>
          </div>
        </div>

        <div
          tabindex="0"
          role="region"
          aria-labelledby="catalog-table-caption"
          class="table-wrapper"
        >
          <table class="catalog-table">
            <caption id="catalog-table-caption" class="sr-only">
              {{ uiText.tableCaption }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ uiText.colModule }}</th>
                <th scope="col">{{ uiText.colType }}</th>
                <th scope="col">{{ uiText.colInvoke }}</th>
                <th scope="col">{{ uiText.colPurpose }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in cliAndActionsCatalog" :key="item.name">
                <th scope="row">{{ item.name }}</th>
                <td><span class="kind-pill">{{ item.kind }}</span></td>
                <td><code class="table-code">{{ item.invocation }}</code></td>
                <td>{{ item.purpose }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Security & Anti-Token-Slicing Architecture -->
      <section class="security-section" aria-labelledby="security-heading">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">{{ uiText.secEyebrow }}</span>
            <h2 id="security-heading" class="section-title">{{ uiText.secTitle }}</h2>
          </div>
        </div>

        <div class="security-grid">
          <article v-for="rule in securityRules" :key="rule.ruleId" class="sec-card">
            <div class="sec-rule-id">{{ rule.ruleId }}</div>
            <h3 class="sec-title">{{ rule.title }}</h3>
            <p class="sec-desc">{{ rule.desc }}</p>
          </article>
        </div>
      </section>
    </main>

    <footer class="ci-footer">
      <span>@gkucmierz/ci-workflows v{{ appVersion }}</span>
      <span>•</span>
      <span>{{ uiText.footerNote }}</span>
    </footer>
  </div>
</template>

<style>
:root {
  --bg-base: #070b14;
  --bg-card: #0d1424;
  --bg-elevated: #131c31;
  --border-subtle: rgba(148, 163, 184, 0.16);
  --border-accent: rgba(56, 189, 248, 0.38);
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --accent-cyan: #38bdf8;
  --accent-emerald: #10b981;
  --accent-amber: #f59e0b;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-base);
  color: var(--text-main);
  font-family: var(--font-sans);
  line-height: 1.6;
  min-height: 100dvh;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.ci-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.ci-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(7, 11, 20, 0.88);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
}

.ci-header-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(56, 189, 248, 0.22));
  border: 1px solid rgba(56, 189, 248, 0.35);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  line-height: 0;
}

.brand-bolt-svg {
  display: block;
  width: 20px;
  height: 20px;
}

.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.brand-title {
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 1.05rem;
  color: #ffffff;
}

.version-pill,
.zero-deps-pill {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.version-pill {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.zero-deps-pill {
  color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.brand-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.header-right-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-install-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  padding: 6px 10px 6px 14px;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #e2e8f0;
}

.lang-switch {
  display: inline-flex;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.lang-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lang-btn.active {
  background: rgba(56, 189, 248, 0.18);
  color: #ffffff;
}

.copy-mini-btn,
.copy-yaml-btn {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.copy-mini-btn:hover,
.copy-yaml-btn:hover {
  background: rgba(56, 189, 248, 0.26);
}

.ci-main {
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 44px;
  flex: 1;
}

.hero-card {
  background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 55%),
    var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 32px;
}

.hero-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.hero-tag {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}

.hero-tag.emerald {
  color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.hero-tag.cyan {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.hero-tag.amber {
  color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* Responsive typography using clamp() combining viewport and rem units */
.hero-heading {
  font-size: clamp(1.5rem, 1rem + 2vw, 2.25rem);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
  color: #ffffff;
}

.hero-lead {
  color: var(--text-muted);
  font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.08rem);
  max-width: 920px;
  margin-bottom: 28px;
}

.hero-pillars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.pillar-box {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 18px;
}

.pillar-num {
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--accent-cyan);
  margin-bottom: 4px;
}

.pillar-label {
  font-weight: 700;
  font-size: 0.92rem;
  margin-bottom: 6px;
}

.pillar-desc {
  font-size: 0.83rem;
  color: var(--text-muted);
}

.section-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-cyan);
  letter-spacing: 0.08em;
}

.section-title {
  font-size: clamp(1.25rem, 1rem + 1vw, 1.65rem);
  font-weight: 800;
  color: #ffffff;
  margin-top: 4px;
  margin-bottom: 18px;
}

.archetype-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.arch-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.arch-tab-btn:hover {
  border-color: rgba(56, 189, 248, 0.3);
  color: var(--text-main);
}

.arch-tab-btn.active {
  background: rgba(56, 189, 248, 0.14);
  border-color: var(--accent-cyan);
  color: #ffffff;
}

.arch-num {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent-cyan);
}

.studio-grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 20px;
}

@media (max-width: 920px) {
  .studio-grid {
    grid-template-columns: 1fr;
  }
}

.studio-left-card,
.studio-right-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 24px;
}

.arch-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 3px 9px;
  border-radius: 999px;
  margin-bottom: 10px;
}

.arch-card-title {
  font-size: 1.25rem;
  font-weight: 800;
  margin-bottom: 6px;
}

.arch-file-path {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--accent-cyan);
  margin-bottom: 12px;
}

.arch-summary {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.arch-highlights {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.arch-highlights li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
}

.check-dot {
  color: var(--accent-emerald);
  font-weight: 800;
}

.config-form-box {
  border-top: 1px solid var(--border-subtle);
  padding-top: 16px;
}

.config-form-title {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 12px;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.field-input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.field-switch-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 0.82rem;
  color: var(--text-main);
}

.field-switch-master {
  padding-bottom: 8px;
  margin-bottom: 2px;
  border-bottom: 1px dashed var(--border-subtle);
}

.code-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.code-filename {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--accent-amber);
}

.yaml-code-block {
  background: #050811;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 18px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.55;
  color: #e2e8f0;
}

/* Responsive Data Table with Container Queries & Sticky Headers (modern-web-guidance: responsive-table) */
.table-wrapper {
  overflow-x: auto;
  overflow-y: visible;
  max-inline-size: 100%;
  container-type: inline-size;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--bg-card);
}

.catalog-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.86rem;
}

.catalog-table thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--bg-elevated);
}

.catalog-table th,
.catalog-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}

.catalog-table tbody tr:last-child th,
.catalog-table tbody tr:last-child td {
  border-bottom: none;
}

.catalog-table thead th {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.catalog-table tbody th {
  position: sticky;
  inset-inline-start: 0;
  background: var(--bg-card);
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-cyan);
}

.kind-pill {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.1);
  color: var(--accent-cyan);
}

.table-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #e2e8f0;
  word-break: break-all;
}

@container (width < 600px) {
  .catalog-table,
  .catalog-table thead,
  .catalog-table tbody,
  .catalog-table tr,
  .catalog-table th,
  .catalog-table td {
    display: block;
  }

  .catalog-table thead {
    display: none;
  }

  .catalog-table tr {
    margin-block-end: 1rem;
    border: 1px solid var(--border-subtle);
  }

  .catalog-table tbody th {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    background: var(--bg-elevated);
  }

  .catalog-table {
    --label-2: "Typ";
    --label-3: "Wywołanie";
    --label-4: "Zadanie";
  }

  .catalog-table td:nth-child(2)::before {
    content: var(--label-2) ": ";
    font-weight: 700;
    color: var(--text-muted);
  }

  .catalog-table td:nth-child(3)::before {
    content: var(--label-3) ": ";
    font-weight: 700;
    color: var(--text-muted);
  }

  .catalog-table td:nth-child(4)::before {
    content: var(--label-4) ": ";
    font-weight: 700;
    color: var(--text-muted);
  }
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.sec-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 20px;
}

.sec-rule-id {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-amber);
  margin-bottom: 6px;
}

.sec-title {
  font-size: 0.98rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.sec-desc {
  font-size: 0.84rem;
  color: var(--text-muted);
}

.ci-footer {
  border-top: 1px solid var(--border-subtle);
  padding: 20px 24px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--text-muted);
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
