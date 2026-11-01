# `@gkucmierz/ci-workflows` — Deterministyczny Katalog Reużywalnych Workflowów i Akcji CI/CD (Zero-Hallucination SSoT)

Centralne repozytorium sprawdzonych, sparametryzowanych wzorców CI/CD dla ekosystemu `7u.pl` oraz projektów Open Source. Zamiast pisać ad-hoc skrypty bash/YAML w każdym repozytorium (co prowadzi do rozjazdów i halucynacji przy budowaniu), każdy projekt wybiera **jeden z 5 deterministycznych archetypów**:

---

## Katalog 5 Archetypów (`on: workflow_call`)

| # | Archetyp Workflowu | Plik w `.gitea/workflows/` | Przeznaczenie |
|---|---|---|---|
| **1** | **Zero-Downtime App Deploy** | [`zero-downtime-deploy.yml`](./.gitea/workflows/zero-downtime-deploy.yml) | Aplikacje SPA / Vite / VitePress (`hot_swap_static: true`) oraz backendy Docker Compose (`hot_swap_static: false`) z bramką `wait-for-deps`, przeładowaniem DNS w Nginx Proxy Manager i opcjonalnym `healthcheck_url`. |
| **2** | **Dual-Registry NPM Publish** | [`publish-package.yml`](./.gitea/workflows/publish-package.yml) | Biblioteki NPM (`@gkucmierz/*`): skaner `oss-sanitize-gate`, auto-detekcja `npm test` i `npm run build`, idempotentny skip gdy wersja już istnieje, publikacja na `registry.npmjs.org` oraz prywatny rejestr Gitea/Gitee. |
| **3** | **Git Mirror & OSS Sanitization** | [`git-mirror-sync.yml`](./.gitea/workflows/git-mirror-sync.yml) | Bezpieczna synchronizacja (mirror push) z prywatnej Gitei na publiczny GitHub / Gitee / GitLab po przejściu skanera `oss-sanitize-gate` (blokada wycieku `/Users/...`, `.agents`, kluczy prywatnych). |
| **4** | **Scheduled Container Job** | [`scheduled-container-job.yml`](./.gitea/workflows/scheduled-container-job.yml) | Cykliczne crawlery i zadania cron wykonywane wewnątrz działającego kontenera (`fuel-index`, `mem-index`) z rozróżnieniem `schedule` vs `workflow_dispatch`. |
| **5** | **Cross-Repo Workflow Dispatch** | [`trigger-downstream.yml`](./.gitea/workflows/trigger-downstream.yml) | Automatyczne wyzwalanie przebudowy zależnych aplikacji przez API Gitei/GitHuba po publikacji nowej wersji biblioteki lub pluginu. |

---

## Przykłady użycia (Zero-Hallucination Templates)

### 1. Aplikacja Webowa / Blog (`zero-downtime-deploy.yml`)
```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    uses: gkucmierz/ci-workflows/.gitea/workflows/zero-downtime-deploy.yml@main
    with:
      container_name: music-app
      runs_on: self-hosted-pl
      hot_swap_static: true
      healthcheck_url: http://localhost:6162/
```

### 2. Biblioteka NPM — Dual Publish (`publish-package.yml`)
```yaml
name: Test & Publish Package
on:
  push:
    branches: [main]

jobs:
  publish:
    uses: gkucmierz/ci-workflows/.gitea/workflows/publish-package.yml@main
    with:
      runs_on: self-hosted-pl
      publish_npmjs: true
      publish_private: true
      oss_sanitize_check: true
    secrets:
      NPM_AUTH_TOKEN: ${{ secrets.NPM_AUTH_TOKEN }}
      LOCAL_PACKAGE_REGISTRY: ${{ secrets.LOCAL_PACKAGE_REGISTRY }}
```

### 3. Mirror na GitHub / Gitee z bramką sanityzacji (`git-mirror-sync.yml`)
```yaml
name: Mirror to Public GitHub
on:
  push:
    branches: [main]

jobs:
  mirror:
    uses: gkucmierz/ci-workflows/.gitea/workflows/git-mirror-sync.yml@main
    with:
      target_remote_url: https://github.com/gkucmierz/dashboard-app.git
      target_branch: main
      oss_sanitize_check: true
    secrets:
      MIRROR_USERNAME: gkucmierz
      MIRROR_TOKEN: ${{ secrets.GITHUB_MIRROR_TOKEN }}
```

### 4. Crawler / Cron w kontenerze (`scheduled-container-job.yml`)
```yaml
name: Scheduled Crawler
on:
  schedule:
    - cron: '15 */6 * * *'
  workflow_dispatch:

jobs:
  crawl:
    uses: gkucmierz/ci-workflows/.gitea/workflows/scheduled-container-job.yml@main
    with:
      container_name: fuel-index
      command_scheduled: node --experimental-sqlite crawler/src/run.js --scheduled
      command_manual: node --experimental-sqlite crawler/src/run.js
```

### 5. Wyzwolenie zależnych projektów (`trigger-downstream.yml`)
```yaml
name: Trigger Dependent Apps
on:
  push:
    branches: [main]

jobs:
  trigger:
    uses: gkucmierz/ci-workflows/.gitea/workflows/trigger-downstream.yml@main
    with:
      target_repos: gkucmierz/virtual-keyboard,gkucmierz/science-blog
      workflow_file: deploy.yml
    secrets:
      DISPATCH_PAT: ${{ secrets.EXTENSION_PAT }}
```
