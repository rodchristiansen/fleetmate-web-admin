# FleetMate Web Admin

The shared core for Munki Web Studio and Cimian Web Studio. Read
`docs/architecture.md` and `docs/plan.md` before implementation. Everything in
them is a proposal until explicitly accepted.

## What belongs here

Only code and design that both studios use: the workspace UI shell, the change-set
and revision model, the job contract and runner, identity, audit, and the
repository adapter interface. Anything that knows about plist, Munki keys, Cimian
keys, a condition syntax, or a platform tool belongs in a studio repository.

A change to an adapter or job contract here needs a matching change in both
studios before it is called done.

## Worktrees and delivery

Create task worktrees inside `./.worktrees/` with the global `git wt` alias,
starting from `origin/main`. Keep `/.worktrees/` ignored. Use task branches and
reviewed pull requests. Never add assistant attribution or bracketed tags to
commit subjects. Track work in this repository's GitHub issues, and link the
studio issues it affects.

## Repository integrity

Use synthetic fixtures. Never attach a live Munki or Cimian repository during
development without explicit authorization. The core never parses or rewrites
repository files itself; adapters own fidelity.

## Infrastructure

All deployable configuration belongs in versioned IaC and the reviewed deployment
path. Planning does not authorize cloud provisioning or identity changes. Keep
application state, repository content, credentials, and package payloads out of
this repository. Select a license before public distribution.
