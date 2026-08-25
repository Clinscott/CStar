# Codex Session Locator Storage Boundary

Active-turn authorization locates exactly one root-user Codex session file
under the host-owned sessions root. The locator enumerates directories
incrementally; it never materializes a whole directory entry array.

The scan is capped at 20,000 entries and 16 nested directories. Symlinks are
ignored, duplicate exact thread matches fail closed, and the selected file must
be an owner-controlled, unique regular file no larger than 512 MiB inside the
canonical sessions root. Content scanning then uses the fixed-descriptor,
streaming request-identity contract.

These bounds prevent a large or adversarial session tree from creating an
unbounded MCP memory spike. They do not grant execution, spend, source, Git,
installation, restart, deployment, configuration, or production authority.
