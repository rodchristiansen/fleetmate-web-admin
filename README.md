# FleetMate Web Admin

One web admin for teams that run both Munki and Cimian.

FleetMate hosts the two studios side by side under one sign-in:

- **[Munki Web Studio](https://github.com/rodchristiansen/munki-web-studio)**
  for Munki repositories.
- **[Cimian Web Studio](https://github.com/windowsadmins/cimian-web-studio)**
  for Cimian repositories.

Each studio is a complete app that runs on its own. If you only manage Munki
or only Cimian, install that studio and skip FleetMate. FleetMate adds what you
need only when you run both: one sign-in, one place to switch between Mac and
Windows repositories, one Activity view across both platforms' jobs, one MCP
endpoint for AI agents covering both, and one deployment.

FleetMate depends on the studios. The studios never depend on FleetMate.

**Status: planning. There is no application code yet.**

## Start here

- [Architecture: hosting two standalone studios](docs/architecture.md)
- [Plan](docs/plan.md)
- [Codec spike](spikes/codec/results/summary.md), the test behind the backend
  recommendation
