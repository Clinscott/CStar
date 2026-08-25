# Retired Orchestrator Runtime Effects

The legacy scheduler, reaper lifecycle writer, telemetry bridge, process
manager, worker bridge, delegated-request reconciler, branch persister, and
episodic-memory receipt writer are retired compatibility surfaces.

They cannot update Hall, signal or spawn a process, write memory or validation
rows, select autonomous work, or reconcile a delegated request. The Reaper's
deterministic outcome classifier remains pure and proposes no lifecycle change.

Use named `cstar-kernel` tools for bead transitions and validation. Use the
durable CStar Forge or Researcher request lane for execution and evidence.
