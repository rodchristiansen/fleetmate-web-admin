# Product plan

Status: proposal · 2026-10-20

## Direction

Build Cimian Web Studio as an independent web application for Cimian
repositories. CimianStudio, the native Windows app, is the workflow reference.
It is built on FleetMate Web Admin, the core it shares with Munki Web Studio:
the core owns the workspace, change sets, jobs, and identity, and this project
owns the Cimian repository format, conditions, and Windows worker.

Community demand is the reason to start now. Admins evaluating Cimian for larger
fleets ask for a web admin panel comparable to MunkiWebAdmin, so a browser-based
editor that needs no Windows desktop is the first audience: an administrator or
small team managing an existing Cimian repository.

## Product principles

1. Repository YAML remains authoritative; an index is replaceable.
2. Opening a repo does not convert it or move it into a database.
3. Structured editing and source inspection are complementary.
4. Save, `makecatalogs`, Git commit, and publication are distinct operations.
5. Capabilities are honest: Windows-only tools show a reason and a next step.
6. Changes are attributable and conflicts are visible before overwriting data.
7. Browser support includes current Edge/Chrome, Safari, and Firefox at release.

## Initial scope

| Capability            | First useful release                                              | Later                                                 |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Repository connection | One configured filesystem repo, read-only first                   | Multiple repos; Azure Blob or S3 connector            |
| Packages              | Search/filter, versions, pkginfo editor, source and diff          | Bulk edits, installer inspection                      |
| Manifests             | Catalogs, included manifests, managed item lists                  | Conditional item editor with fact picker              |
| Conditions            | Parse and display `conditional_items`; syntax errors visible      | Evaluate against a supplied fact set                  |
| Catalogs              | Membership view; `makecatalogs` job on a Windows worker           | Promotion rules and scheduling                        |
| Validation            | YAML errors, missing references, include cycles, missing payloads | Hash verification against `pkgs/`                     |
| Changes               | Draft isolation, preview, safe save, conflict detection, audit    | Git commit/push and pull-request integration          |
| Authentication        | Authenticated team access before networked writable use           | Entra ID and other OIDC providers, scoped roles       |
| Imports               | Capability boundary and job contract                              | `cimiimport` on the Windows worker, resumable uploads |

Git is optional. Existing `cimiimport`, AutoPkg, and command-line workflows must
keep working. YAML is the only metadata format; formatting changes are always
visible in review before save.

## Milestones and acceptance

### Discovery and decisions

- Review CimianStudio's models and Cimian's `makecatalogs` and conditions code;
  record provenance without copying real repository data.
- Decide the backend after a spike on YAML fidelity and reuse of Cimian's .NET
  models (see architecture).
- Review the design study for Packages, Manifests, and Changes.
- Decide license, supported Cimian versions, and identity boundary.

Done when those choices are recorded and the first implementation issue is bounded.

### Read-only repository explorer

- Synthetic fixtures: nested `pkgsinfo/` directories, repeated names and versions,
  quoted and unquoted versions, unknown keys, comments, multi-line scripts,
  `conditional_items` in both string and fact/operator forms, missing payloads.
- Read/search/list/detail API and browser UI with stable relative-path identities.
- Invalid files remain visible with diagnostics; no writes on scan or open.
- Explicit reindex and freshness display when another tool changes files.

Done when scans leave every fixture byte unchanged, deep links work, and large
fixture repos remain usable. Provisional benchmark: 10,000 pkginfo files and
2,000 manifests, warm search below 300 ms server time.

### Safe structured editing

- Small pkginfo field set and manifest item editor with source/diff preview.
- Unknown keys, key order, and version string quoting survive; no-op saves do not
  rewrite files.
- A stale revision returns a conflict with reload/reapply choices.
- Auth, request forgery protection, authorization, path containment, durable audit,
  and crash recovery are prerequisites to networked writes.

Done when two editors plus an external `cimiimport` or CimianStudio writer cannot
silently lose changes.

### Catalog and Git workflow

- Windows worker capability handshake with pinned Cimian tool version.
- `makecatalogs` runs against a reviewed snapshot, validates outputs, then
  publishes according to the configured deployment model.
- Optional Git review shows the exact diff and current commit; commit and push are
  separate actions.

Done when failed jobs preserve the last published revision and retries cannot
duplicate publication. Test on a disposable repo and a real Cimian test client.

### Imports and broader workflows

- Resumable uploads into staging, hash verification, `cimiimport` on the worker,
  and a reviewed import result.
- Icons, `repoclean`, and promotion follow as separate slices.

## Open decisions

| Decision           | Proposed default                                                    | What could change it                                 |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------------------------- |
| Initial deployment | Self-hosted, existing filesystem repo                               | A hosted-first product goal                          |
| Frontend           | React + TypeScript + Vite, same as Munki Web Studio                 | A shared design system choice                        |
| Backend | Set by the FleetMate Web Admin dual-codec spike | Cimian model reuse may favor .NET |
| Runtime topology   | One writer per repo; optional Windows worker                        | Need for multiple writers or instances               |
| State              | SQLite on local durable disk for a single-host pilot                | Shared control plane needs PostgreSQL                |
| Windows jobs       | Optional Windows worker; unavailable capabilities explicit          | Cross-platform builds of `makecatalogs`              |
| Git model          | Optional repository integration                                     | Team requires PR-only metadata changes               |
| Identity           | OIDC, Entra ID first candidate                                      | Existing self-hosted identity requirements           |
| License/visibility | Private exploration; MIT likely, to match Cimian                    | Decision to publish and accept contributions         |

## Next implementation slice

Start with the read-only explorer after the backend spike. Use small,
independently reviewable PRs with synthetic fixtures and one observable workflow
per slice.
