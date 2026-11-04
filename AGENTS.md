# FleetMate Web Admin

The combined web admin for Munki and Cimian. It hosts
`rodchristiansen/munki-web-studio` and `windowsadmins/cimian-web-studio`, which
are complete standalone products. Read `docs/architecture.md` and `docs/plan.md`,
plus each studio's `docs/hosting.md`, before implementation. Everything is a
proposal until explicitly accepted.

## Dependency direction

FleetMate depends on the two studios' released packages. The studios never
depend on FleetMate, and must keep working without it.

- Munki or Cimian behavior (file formats, fields, conditions, workers, the
  workspace, editing, review, jobs) belongs in the studio. Never add it here.
- FleetMate holds only what exists because both studios run together: the
  shell that mounts both, shared sign-in, the repository switcher, the combined
  Activity and diagnostics views, combined deployment, and the drift check.
- If FleetMate needs something a studio does not provide, change the studio's
  hosting surface there, in both studios, and then consume the new release here.
- Never patch, vendor, or fork studio code inside this repository.

## Worktrees and delivery

Create task worktrees inside `./.worktrees/` with the global `git wt` alias,
starting from `origin/main`. Keep `/.worktrees/` ignored. Use task branches and
reviewed pull requests. Never add assistant attribution or bracketed tags to
commit subjects. Track work in this repository's GitHub issues.

## Repository integrity

Use synthetic fixtures. Never attach a live Munki or Cimian repository during
development without explicit authorization.

## Infrastructure

All deployable configuration belongs in versioned IaC and the reviewed deployment
path. Planning does not authorize cloud provisioning or identity changes. Keep
application state, repository content, credentials, and package payloads out of
this repository. Select a license before public distribution.
