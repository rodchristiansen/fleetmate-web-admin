# FleetMate Web Admin

A web admin for Munki and Cimian software repositories. One codebase builds
three apps:

- **FleetMate Web Admin**: manages Munki and Cimian repositories side by side.
- **[Munki Web Studio](https://github.com/rodchristiansen/munki-web-studio)**:
  the Munki-only build, a modern successor in spirit to MunkiWebAdmin.
- **[Cimian Web Studio](https://github.com/windowsadmins/cimian-web-studio)**:
  the Cimian-only build for Windows fleets.

Munki and Cimian repositories share one shape: pkginfo, manifests, and catalogs
built by `makecatalogs`. FleetMate owns the shared workspace, review flow, jobs,
and sign-in. A small adapter per platform handles its file format, conditions,
and tools.

**Status: planning. There is no application code yet.**

All development happens here. The two studio repositories receive releases from
this one and hold no source of their own.

## Start here

- [Architecture: one core, two adapters](docs/architecture.md)
- [Plan and sequencing](docs/plan.md)
- [Releases and the studio mirrors](docs/releases.md)
- [Munki platform plan](docs/munki/README.md)
- [Cimian platform plan](docs/cimian/README.md)

## Design studies

Each platform has an interactive workspace study with invented data. To serve
them, run this from the repository root:

```sh
python3 -m http.server 3186 --bind 127.0.0.1
```

Then open <http://127.0.0.1:3186/docs/munki/design/workspace.html> or
<http://127.0.0.1:3186/docs/cimian/design/workspace.html>.
