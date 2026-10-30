# `@gkucmierz/ci-workflows` — Reużywalne Gitea Actions & Dependency Readiness Gate (`wait-for-deps`)

Centralne repozytorium reużywalnych bloków CI/CD dla ekosystemu `7u.pl`:
1. **`wait-for-deps` (`wait-for-deps/action.yml` / `bin/wait-for-deps.mjs`)** — Asynchroniczny „poczekiwacz” weryfikujący przed `docker compose build`, czy wszystkie wymagane wersje bibliotek `@gkucmierz/*` z `package.json` są już opublikowane i ściągalne z rejestru NPM (chroni przed błędem `ETARGET`, gdy aplikacja została wypchnięta chwilę przed biblioteką).
2. **`zero-downtime-swap` (`zero-downtime-swap/action.yml`)** — Kompozytowa akcja wykonująca `docker compose build` podczas działania kontenera, atomowy hot-swap statycznych plików Nginx (`0 ms` przestoju, zachowane IP w sieci `npm_public`) oraz przeładowanie cache DNS w Nginx Proxy Manager.
3. **`zero-downtime-deploy.yml` (`.gitea/workflows/zero-downtime-deploy.yml`)** — Pełny reużywalny workflow (`on: workflow_call`).

---

## Sposoby użycia w projektach Gitea Actions

### Wariant 1: Reużywalny Workflow (`on: workflow_call`) — najkrótszy zapis w `.gitea/workflows/deploy.yml`
```yaml
name: Build and Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: gkucmierz/ci-workflows/.gitea/workflows/zero-downtime-deploy.yml@main
    with:
      container_name: science-blog
      runs_on: self-hosted-pl
      hot_swap_static: true
```

### Wariant 2: Kompozytowe Akcje (`uses: .../wait-for-deps@main`) wewnątrz własnego joba
```yaml
steps:
  - uses: actions/checkout@v4
  - name: Wait for @gkucmierz/* dependencies
    uses: https://gitea.7u.pl/gkucmierz/ci-workflows/wait-for-deps@main
  - name: Zero-Downtime Docker Build & Hot-Swap
    uses: https://gitea.7u.pl/gkucmierz/ci-workflows/zero-downtime-swap@main
    with:
      container_name: science-blog
```
