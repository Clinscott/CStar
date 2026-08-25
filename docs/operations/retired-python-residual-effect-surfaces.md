# Retired Python Residual Effect Surfaces

The TypeScript CStar kernel owns durable lifecycle and Hall state. Four residual
Python compatibility families are bounded as follows:

- `ValidationResult`, score-delta calculation, and Hall-run projection are
  detached schema helpers. Direct persistence fails with
  `legacy_python_validation_persistence_retired_use_cstar_record_result`; use
  `cstar_record_result` for the authorized lifecycle mutation.
- `GungnirValidator` remains a pure SPRT calculation over caller-supplied
  trials. `TheWatcher` fails with
  `legacy_python_stability_watcher_retired_use_cstar_kernel` before Hall,
  filesystem traversal, or watcher-state mutation.
- `SandboxWarden` performs no Docker availability probe and has no native
  subprocess fallback. Its action fails with
  `legacy_python_sandbox_warden_retired_use_supported_sandbox` before path,
  process, network, or cleanup effects.
- `MemoryDB` is a process-local detached lexical index. It imports neither
  Chroma nor Hall, creates no persistent client, and starts empty. Its former
  Hall escape hatch fails with
  `legacy_python_memory_authority_retired_use_cstar_kernel`. The adjacent
  `VectorShadow.build_index` compatibility method is an explicit no-op and
  makes no persistence claim.

These compatibility objects do not confer execution, persistence, validation,
or promotion authority. Provider, installation, restart, deployment, and
production gates remain unchanged.
