# Bounded Directory Enumeration

Three long-lived CStar read paths enumerate incrementally instead of loading a
whole directory into memory:

- Codex session lookup: at most 20,000 entries and 16 nested directories.
- local Evolve proposal lookup: at most 5,000 directory entries.
- each verified mounted-spoke skill directory: at most 2,048 entries.

The proposal and spoke readers retain their existing path containment,
symlink, file-size, mount-token, and trust checks. Exceeding a cap fails closed
instead of returning a partial authoritative-looking inventory. These reads are
evidence/discovery only and grant no lifecycle mutation or execution authority.
