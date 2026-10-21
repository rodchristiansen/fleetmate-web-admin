# Releases and the studio mirrors

Status: decided 2026-10-20; the release job is not built yet.

## Model

This repository is the only place code is written. Munki Web Studio and Cimian
Web Studio each keep a repository so their communities can find, star, watch,
and download them, but those repositories only receive what this one publishes.

| Repository                            | Role                                                   | Who writes to it             |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| `rodchristiansen/fleetmate-web-admin` | Source, issues for code, pull requests, combined build | People, through reviewed PRs |
| `rodchristiansen/munki-web-studio`    | Munki-only releases, README, user-facing issues        | The release job              |
| `windowsadmins/cimian-web-studio`     | Cimian-only releases, README, user-facing issues       | The release job              |

## What the release job publishes

On a tagged release here, a GitHub Actions workflow:

1. Builds the combined app and both studio profiles from the same commit.
2. Creates a GitHub release in each studio repository with that profile's
   artifacts (container image reference, Windows or Mac worker package) and
   release notes filtered to the changes that affect it.
3. Regenerates each studio's README from `studios/<repository>/README.md` here, so
   install instructions always match the published build.
4. Records the source commit in every release so a studio build traces back to
   exactly one FleetMate commit.

The job never pushes application source to a studio repository. If a studio
README is edited directly, the next release overwrites it.

## Issues

Users file issues where they found the project. A studio issue that needs code
gets a linked issue here; the fix ships in a FleetMate release and the studio
issue closes when the mirrored release lands.

## Access

Publishing across two GitHub owners needs a credential that can write releases
to both studio repositories and nothing else. Use a GitHub App installed on those
two repositories with contents and releases permissions, declared and reviewed
like any other deployable configuration. No personal access token.

## Before the first release

- Build profiles exist and produce working studio builds.
- The GitHub App exists, installed on both studio repositories.
- License chosen; a public studio needs one before its first release.
