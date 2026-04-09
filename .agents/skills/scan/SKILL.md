---
name: scan
description: "Use when performing structural repository scans, extracting symbols and intent, and updating Mimir and the Gungnir matrix."
risk: safe
source: internal
---

# 🔱 PENNYONE SCAN SKILL (v2.5)

## When to Use
- Use when performing structural repository scans, extracting symbols and intent, and updating Mimir and the Gungnir matrix.

## MANDATE (HOST-NATIVE)
Perform structural and intelligence scans of the repository. This is a **Host-Native Skill** that delegates deep sector analysis to the One Mind via sub-agents returning structured JSON metadata.

## LOGIC PROTOCOL
1. **TARGET ACQUISITION**: Identify the sector or root path to be scanned.
2. **MATRIX SYNCHRONIZATION**: Trigger the PennyOne engine (Node.js backend) to parse files.
3. **SUB-AGENT DELEGATION**: For each sector, dispatch a host-level sub-agent request to generate JSON-formatted intent and interaction summaries.
4. **FUNCTIONAL CLUSTERING**: Apply community detection (Louvain) to the dependency graph to identify functional sectors.
5. **RECORD KEEPING**: Update the SQLite FTS5 database (Well of Mimir) and the matrix graph.

## CONSTRAINTS
- Incremental by default (only scans changed files based on MD5 hashes).
- Can be forced to re-index entirely.

## USAGE
`cstar scan [--path <dir>] [--force]`
