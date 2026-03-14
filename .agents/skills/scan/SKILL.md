---
name: scan
description: "Use when performing structural repository scans, extracting symbols and intent, and updating Mimir and the Gungnir matrix."
risk: safe
source: internal
---

# 🔱 PENNYONE SCAN SKILL (v1.0)

## When to Use
- Use when performing structural repository scans, extracting symbols and intent, and updating Mimir and the Gungnir matrix.


## MANDATE
Perform structural and intelligence scans of the repository to update the Gungnir Matrix and Mimir's Well.

## LOGIC PROTOCOL
1. **TARGET ACQUISITION**: Identify the sector or root path to be scanned.
2. **MATRIX SYNCHRONIZATION**: Trigger the PennyOne engine (Node.js backend) to parse files.
3. **INTELLIGENCE EXTRACTION**: Extract AST symbols and generate high-fidelity intent using the One Mind.
4. **RECORD KEEPING**: Update the SQLite FTS5 database (Well of Mimir) and the matrix graph.

## CONSTRAINTS
- Incremental by default (only scans changed files based on MD5 hashes).
- Can be forced to re-index entirely.

## USAGE
`cstar scan [--path <dir>] [--force]`
