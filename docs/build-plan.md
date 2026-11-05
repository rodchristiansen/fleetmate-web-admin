# Build plan and loop protocol

Status: active · 2026-11-04

This page orders the whole build across the three repositories and says exactly
what one loop iteration does. Each studio's own `docs/build-plan.md` describes
its slices and stack; the studios do not depend on this page.

## Repositories

| Short name | Repository                            | Local checkout                                                |
| ---------- | ------------------------------------- | ------------------------------------------------------------- |
| Munki      | `rodchristiansen/munki-web-studio`    | `~/Developer/GitHub/rodchristiansen/apps/munki-web-studio`    |
| Cimian     | `windowsadmins/cimian-web-studio`     | `~/Developer/GitHub/windowsadmins/cimian-web-studio`          |
| FleetMate  | `rodchristiansen/fleetmate-web-admin` | `~/Developer/GitHub/rodchristiansen/apps/fleetmate-web-admin` |

## Order

Work is taken strictly in this order. A step is done when its issues are closed.

1. For each slice `S01` to `S32`, in number order:
   - the Munki issue, then
   - the Cimian issue (a port for `shared` slices, its own build for `platform`).
2. `F01` and `F07` in FleetMate once `S01` is closed in both studios.
3. `F02` to `F06` and `F08` once `S31` is closed in both studios.

An issue labelled `blocked` or `needs-decision` is skipped; the loop continues
with the next unblocked issue in order and comes back when the label is removed.

## One loop iteration

1. **Sync.** Fetch all three repositories. Read open `slice` issues and pick the
   first unblocked one in the order above. If none remain, stop the loop.
2. **Read.** Read the issue, the repository's `AGENTS.md`, and the docs the issue
   touches. For a Cimian port, read the merged Munki pull request first.
3. **Build.** Create a worktree with `git wt <slug>` from `origin/main`. Implement
   the slice with tests. Keep the shared-code layout identical between studios.
4. **Verify.** Run lint, type check, and tests. Run the app or CLI when the slice
   changes behavior, and check the acceptance list item by item.
5. **Ship.** Commit in plain prose, push, open the pull request with
   `Closes #<n>`, wait for CI, merge, delete the branch and worktree.
6. **Report.** One short line: which slice closed, and the next one up.

One iteration closes at most one issue, so each pull request stays reviewable.

## When to stop and flag instead of building

Label the issue `needs-decision`, comment with the question and options, and move
to the next issue, when a slice needs:

- a choice only the maintainer can make (a name, a provider, a scope cut),
- cloud provisioning, identity configuration, or registry credentials,
- a live repository or any real organization data.

Label it `blocked` with a comment when it waits on hardware or another slice.
Platform testing runs on the maintainer's machines, not cloud runners, to save CI
minutes. Munki tools run on this Mac (`/usr/local/munki` is installed). Windows
and Cimian work runs in the `win-desktop` Claude session, reached with
`SendMessage` (see the `session-messaging` and `win-session` skills): send it the
branch and the exact commands, and read its results before merging. GitHub
Actions runs only on `ubuntu-latest`.

If CI fails three times on the same cause, stop the loop and report the cause.

## Loop command

```text
/loop Build the next slice per ~/Developer/GitHub/rodchristiansen/apps/fleetmate-web-admin/docs/build-plan.md
```
