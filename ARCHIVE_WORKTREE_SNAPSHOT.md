# Archived dirty worktree snapshot

- Source worktree: `csf-d008-fns-set-02-20260810-01`
- Captured: 2026-08-25
- Base commit: `afbbc1770ec6a7a2adc15b83f91c5586ac2525c0`
- Disposition: historical source and receipt preservation only

This branch preserves the complete Git-visible dirty state that remained in the
legacy CStar worktree. It does not grant CStar authority, activate a host
integration, restore Forge execution, or supersede the Organism controller.

The added and modified content passed bounded checks for credential signatures,
JSON syntax, regular-file shape, and oversized files. The historical test suite
was not executed because this snapshot is retained as inert archival lineage,
not adopted as the active CStar tree.
