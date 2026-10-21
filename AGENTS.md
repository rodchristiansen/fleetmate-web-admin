# FleetMate Web Admin

One codebase for a Munki and Cimian web admin. It builds three apps: the
combined FleetMate Web Admin, Munki Web Studio, and Cimian Web Studio. Read
`docs/architecture.md`, `docs/plan.md`, and `docs/releases.md` before
implementation, plus `docs/munki/` or `docs/cimian/` for platform work.
Everything is a proposal until explicitly accepted, except the decisions those
documents mark as decided.

## Where code goes

All code lives here. `rodchristiansen/munki-web-studio` and
`windowsadmins/cimian-web-studio` are release-only mirrors written by the release
job. Never open a PR with source against a studio repository.

- Shared behavior (workspace UI, change sets, revisions, jobs, identity, audit,
  the adapter contract) belongs in the core.
- Anything that knows about plist, Munki or Cimian keys, a condition syntax, or a
  platform tool belongs in that platform's adapter or worker.
- A studio build is a profile that selects one adapter and one theme. Never
  branch on the studio name in shared code.

## Worktrees and delivery

Create task worktrees inside `./.worktrees/` with the global `git wt` alias,
starting from `origin/main`. Keep `/.worktrees/` ignored. Use task branches and
reviewed pull requests. Never add assistant attribution or bracketed tags to
commit subjects. Track code work in this repository's GitHub issues, linking the
studio issue it came from.

## Repository integrity

Use synthetic fixtures. Never attach a live Munki or Cimian repository during
development without explicit authorization. Preserve unknown keys, value types,
version strings, file formats, relative paths, and meaningful ordering. Do not
silently convert formats or make Git mandatory. Catalogs are derived outputs.

## Infrastructure

All deployable configuration belongs in versioned IaC and the reviewed deployment
path, including the GitHub App the release job uses. Planning does not authorize
cloud provisioning or identity changes. Keep application state, repository
content, credentials, and package payloads out of this repository. Select a
license before public distribution.
