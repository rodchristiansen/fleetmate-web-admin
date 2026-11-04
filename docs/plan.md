# Plan

Status: proposal · 2026-11-04

## Order of work

Most work happens in the studios. FleetMate starts once there is something to host.

1. **Studios: backend decision.** Accept or change the recommendation in each
   studio's `docs/backend.md`.
2. **Studios: read-only explorers.** Each studio ships its own read-only
   explorer and runs alone. Nothing here yet.
3. **Studios: hosting surface.** Each studio exposes the surface described in its
   `docs/hosting.md`, tested in its own CI with a minimal fake host.
4. **FleetMate: shell.** Mount both studio packages, provide sign-in, the
   repository switcher, and a combined Activity view.
5. **FleetMate: drift check.** CI compares the two studios' copied workspace code.
6. **FleetMate: deployment.** One Compose file and, if chosen, Terraform for a
   combined deployment.

## Open decisions

| Decision        | Proposed default                                | What could change it                |
| --------------- | ----------------------------------------------- | ----------------------------------- |
| Hosting         | In process, both studios as Python packages     | Studios choosing different runtimes |
| App state       | One database, a schema per studio               | Separate backup or retention needs  |
| Release cadence | FleetMate releases after either studio releases | Contract changes needing both       |
| License         | Matches the studios                             | —                                   |
| Visibility      | Private while planning                          | First usable release                |
