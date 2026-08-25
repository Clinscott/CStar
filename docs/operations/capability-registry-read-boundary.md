# Capability Registry Read Boundary

The checked-in `.agents/skill_registry.json` remains capability metadata, not
runtime authority. Runtime routing, host-support inspection, capability
documentation, and distribution generation read it only from the explicitly
supplied canonical project root.

The shared reader requires a regular, unique file below a canonical non-symlink
root. It rejects absolute or traversing paths, symlinked path segments,
hardlinks, non-files, files over 1 MiB, malformed JSON, non-object roots, and a
file whose identity changes during the read. Capability documentation uses the
same containment rule with a 512 KiB limit.

There is no `CSTAR_CONTROL_ROOT` fallback. A missing registry may produce an
empty compatibility view only where the caller's contract permits absence;
unsafe or malformed inputs fail closed and never trigger the in-code grammar as
though the registry were merely missing.

The reader performs no write, network, provider, process, Hall, environment, or
secret access. Registry declarations still cannot authorize execution; the
request-scoped kernel contract and current operator gate remain decisive.

