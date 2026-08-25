# Retired Hermes Spoke Daemon Protocol

This FIFO/daemon protocol is retired. Its executables are import-safe or
process-safe tombstones that return
`legacy_hermes_daemon_retired_use_cstar_forge_or_researcher` before reading
credentials, starting a provider or process, creating a FIFO, or writing a
spoke.

Implementation uses the durable
`cstar_forge_request -> cstar_forge_execute -> private Hermes cstar-hub ->
minimax/MiniMax-M3` lane. Research uses the authorized CStar Researcher lane.
Hermes authentication is owned by its supported profile/OAuth surface; CStar
must not read `~/.hermes/.env` or construct a replacement key environment.

Historical daemon reports are evidence only and grant no present authority.
