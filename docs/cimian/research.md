# Reference research

Reviewed 2026-10-20. These references inform proposals; they do not prove the
unimplemented web app meets their behavior.

## Existing projects

### Cimian

Repository: <https://github.com/windowsadmins/cimian>, revision
`f82bfc8bff3509191fece4c37d5ae54b04019865`.

- `cli/makecatalogs/`: catalog generation from pkginfo; targets `net10.0-windows`.
- `cli/cimiimport/`, `cli/makepkginfo/`, `cli/cimipkg/`, `cli/repoclean/`,
  `cli/manifestutil/`: the tools a Windows worker would wrap.
- `shared/core/Models/SystemFacts.cs`: the facts conditions evaluate against.
- `wiki/conditional-items-guide.md`: condition syntax, operators, and facts.
- `wiki/cimian-munki-comparison.md`: where Cimian follows and departs from Munki.

### CimianStudio

Repository: <https://github.com/windowsadmins/cimian-studio>, revision
`6b3072adba4c2c37608c1a0cd1541b7a0a375e19`. MIT.

- Navigation: Repository, Packages, Manifests, Catalogs, Import, Build, Git, Settings.
- `src/CimianStudio.Core/Models/`: packages, manifests, catalogs, predicates, search.
- `src/CimianStudio.Infrastructure/Yaml/`: YAML handling to evaluate for reuse.
- `src/CimianStudio.Infrastructure/Services/`: catalog, import, Git, inspector services.
- `samples/SampleRepository/`: a small synthetic repo to seed fixtures.

### Munki Web Studio

Repository: `rodchristiansen/munki-web-studio` (private). The sibling project;
its plan, architecture, and workspace study are the template for this one.

### MunkiWebAdmin2

Repository: <https://github.com/munki/mwa2>. The reference for what admins expect
from a web admin panel: pkginfo and manifest editing in an existing repository.

## Primary documentation

| Source                                                                                          | What it informs                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [ASP.NET Core](https://learn.microsoft.com/aspnet/core/)                                        | .NET backend candidate                           |
| [YamlDotNet](https://github.com/aaubry/YamlDotNet)                                              | .NET YAML parsing; round-trip fidelity to verify |
| [React](https://react.dev/learn) and [Vite](https://vite.dev/guide/)                            | Proposed browser stack                           |
| [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)                       | Read-only repository mounting                    |
| [Azure Container Apps storage](https://learn.microsoft.com/azure/container-apps/storage-mounts) | Ephemeral versus durable mounted storage         |

No YAML round-trip fidelity, cross-platform `makecatalogs`, or cost claim has been
validated. Resolve these in bounded spikes before selecting infrastructure.
