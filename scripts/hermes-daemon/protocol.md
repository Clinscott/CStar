# Historical Hermes spoke-daemon protocol (decommissioned)

This document is retained only to explain old artifacts. The public FIFO
daemon protocol is not an active Corvus surface and must not be started,
queried, or restored as a fallback.

It was retired because it combined unmanaged persistent model processes,
credential loading, direct research, skill generation, and spoke/wiki writes
outside canonical lifecycle and validation controls.

Current routes:

- implementation: durable `cstar_forge_request -> cstar_forge_execute` through
  the private Hermes `cstar-hub` adapter, followed by independent validation;
- research: authorized Researcher lanes with bounded source/artifact receipts;
- project context: mapped PMTs are read-only information repositories.

All executables in this directory now fail closed with
`CSTAR_PUBLIC_HERMES_DAEMON_DECOMMISSIONED`.
