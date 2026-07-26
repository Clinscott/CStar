# Hermes Profile Intake

## Purpose

This package prepares the later recovery of the developed Hermes Forge and
Researcher profiles without copying private runtime state into CStar.

The intake is deliberately two-phase:

1. produce a metadata-only candidate inventory;
2. after operator review, prepare a separately sanitized source bundle.

The preliminary CStar v2 broker cannot execute either profile. Intake
completion does not enable live dispatch, MiniMax spend, xPremium OAuth, or
source collection.

## Package Files

- `LOCAL_PC_INVENTORY.md` — read-only local checklist and metadata command;
- `intake-policy.v1.json` — candidate roots, manual-review classes, and hard
  exclusions;
- `inventory-manifest.schema.json` — bounded machine-readable manifest;
- `inventory-manifest.example.json` — content-free example.

## What May Be Versioned

Candidate assets are limited to source-like material:

- `SKILL.md` contracts and other profile documentation;
- implementation source and deterministic helper scripts;
- prompt and response templates;
- JSON schemas and protocol contracts;
- unit, integration, and contract tests;
- sanitized, synthetic fixtures;
- dependency manifests and lockfiles;
- configuration examples containing placeholders only.

Researcher may have mature implementation code in a nested source-only
subtree. Its local layout is intentionally not committed here. During the
local intake, add one operator-approved relative source root only after
confirming that it contains reusable code rather than vault data. Sibling
runtime or research-data directories must not be traversed or packaged.

`SOUL.md`, prompt material, fixtures, and configuration examples require
manual content review before inclusion because they may mix reusable behavior
with private context.

## Hard Exclusions

The inventory and any later source bundle must exclude:

- secrets, API keys, private keys, passwords, and `.env` files;
- xPremium or other OAuth state, access tokens, refresh tokens, device codes,
  and credential caches;
- sessions, cookies, browser profiles, histories, and authentication state;
- logs, transcripts, traces, stdout/stderr captures, and cost ledgers;
- memories, learned personal context, engrams, and conversation state;
- raw vaults, sources, dossiers, notes, claims, decisions, queues, run
  receipts, generated wiki content, backups, and private research data;
- databases, caches, process IDs, locks, sockets, and runtime state;
- live cron state and real configuration files;
- generated artifacts and any file containing private household, legal,
  financial, contact, or account data.

Do not archive, upload, copy, or commit an entire Hermes profile or
`<HERMES_HOME>`. An exclusion is not made safe by redacting only its filename.

## Required Intake Flow

1. Run the metadata-only checklist in `LOCAL_PC_INVENTORY.md` separately for
   Forge and Researcher.
2. Review only relative candidate paths, sizes, and modification timestamps.
   The first pass contains no file bodies, hashes of excluded files, absolute
   paths, or per-file details about excluded material.
3. Classify each candidate as `candidate`, `manual_review`, or rejected. Omit
   rejected paths from the manifest.
4. Stop and obtain operator approval for the candidate list.
5. In a later task, inspect only approved candidates, run secret/private-data
   checks, replace live configuration with placeholder examples, and create a
   sanitized bundle.
6. Keep every `sha256` value `null` in the metadata-only manifest.
7. Validate the first-pass manifest against
   `inventory-manifest.schema.json`.
8. Use a separate future sanitized-bundle schema to record hashes for approved
   files. This metadata-only schema must not be reused as bundle authority.
9. Import profile source into a private worker-source repository before adding
   a CStar worker registration.

No profile becomes executable merely because its files were recovered. Worker
registration, local enrollment, live OAuth use, and end-to-end execution are
separate gates.

## Safe Deliverables

The first local handoff should contain only:

- one `candidate-files.tsv` per profile from the checklist;
- one manifest shaped like `inventory-manifest.example.json`;
- a short note naming missing expected code areas.

It should not contain a tarball, profile directory, raw vault, actual
configuration, or any secret-bearing file.
