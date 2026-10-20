# FleetMate Web Admin

The shared web admin core behind
[Munki Web Studio](https://github.com/rodchristiansen/munki-web-studio) and
[Cimian Web Studio](https://github.com/windowsadmins/cimian-web-studio).

Munki and Cimian repositories have the same shape: pkginfo, manifests,
catalogs, and a `makecatalogs` step. This repository holds everything the two
web studios have in common, so each studio only adds what is specific to its
platform.

**Status: planning. There is no application code yet.**

## Three repositories

| Repository                            | Holds                                                           | Ships as                                                         |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `rodchristiansen/fleetmate-web-admin` | Workspace UI, change sets, jobs, auth, audit, adapter contracts | Library packages, plus a combined app that opens both repo types |
| `rodchristiansen/munki-web-studio`    | Munki adapter (plist and YAML), Mac worker, Munki conditions    | Munki Web Studio, branded for Mac admins                         |
| `windowsadmins/cimian-web-studio`     | Cimian adapter (YAML), Windows worker, Cimian conditions        | Cimian Web Studio, branded for Windows admins                    |

## Start here

- [Architecture and the core/adapter split](docs/architecture.md)
- [Plan and sequencing across the three repositories](docs/plan.md)

The format-specific plans live in each studio's own `docs/` directory.
