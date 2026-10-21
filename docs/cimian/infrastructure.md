# Infrastructure options

Status: exploration; nothing provisioned · 2026-10-20

## Deployment models

| Model                        | Repository access                                   | Strengths                                  | Main costs                                                   | Recommendation                       |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------ |
| Self-hosted, existing repo   | Filesystem adapter on the operator's host           | Familiar adoption, data stays near tooling | Permissions, backups, external-writer coordination           | Proposed first target                |
| Self-hosted with cloud repo  | Authoring checkout plus publish to Azure Blob or S3 | Matches how many Cimian repos are served   | Storage credentials, sync semantics, partial upload recovery | Second adapter                       |
| Hosted UI/API plus connector | Outbound connector next to each repo                | Central service, repos stay in place       | Enrollment, credentials, offline semantics                   | Later, if a hosted product is wanted |

## First deployment proposal

- One application instance with one repository writer; static assets and API under
  one origin.
- Repository mount read-only during discovery; writable authoring checkout later.
- SQLite, drafts, jobs, and audit on a local durable volume, never on SMB/NFS.
- Uploads, staging, and `pkgs/` payloads outside the app image.
- Existing TLS ingress or a declared reverse proxy; development binds to loopback.
- Docker Compose once the app exists: non-root user, health checks, runtime secrets.
- The Windows worker is a separate service on a Windows host with Cimian installed.
  It connects outbound to the app and receives leased jobs.

No Redis, Kubernetes, search cluster, or object store is required for the first
single-host explorer.

## Hosting comparison

| Hosting                                 | Fit                                           | Gate before selecting                                |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Existing VM + Docker Compose            | Direct route to a filesystem repo             | UID/GID, locking, backups, TLS                       |
| Windows Server + IIS or Kestrel service | App and tools on one host, no separate worker | Service packaging, upgrades, isolation               |
| Azure Container Apps                    | Managed ingress; pairs with Azure Blob repos  | Storage mounts and locking, database, identity, cost |

## IaC contract

Docker Compose declares the local profile. For any cloud target, Terraform owns
compute, storage, network, DNS, certificates, identities, app registrations,
assignments, secret references, monitoring, and backups. State stays encrypted
and out of Git. Portal or ad hoc CLI changes are diagnosis or recovery only.

## Operations and recovery

Back up repository metadata and payloads, durable app state, and deployment
configuration. Git history does not back up ignored packages, drafts, or audit.
Show stale indexes, disconnected workers, stuck jobs, and the deployed version in
diagnostics. Logs omit credentials and full scripts by default.

## First infrastructure spike

Read-only scan of a disposable repo, app-state restore, external change detection,
and a capability handshake from a Windows worker running `makecatalogs`.
Provision no cloud resources as part of planning.
