# Legacy v2 Hermes Profile Intake (Metadata Only)

This document is historical compatibility material. It does not enroll a
worker, select a transport, or establish runtime readiness. Current
implementation uses CStar deterministic effects and native task-control work
cells. Forge is `TOMBSTONED_PERMANENT`; Hermes/MiniMax Forge material is
historical only, and MM is inactive.

## Purpose

This package defines a metadata-first intake contract for identifying historical
reusable Forge or Researcher profile source candidates without copying Hermes
profile contents or private runtime state into CStar.

The first pass records only normalized relative candidate paths, byte sizes,
modification epochs, asset classifications, and review status. It includes no
file bodies or hashes. A later sanitized-source review is a separate,
operator-gated task.

This package defines no collector command, executable workflow, operational
endpoint, or runtime integration.

## Package Files

- `intake-policy.v1.json` defines candidate classes, exclusions, authority
  boundaries, and later-review gates.
- `inventory-manifest.schema.json` is the closed metadata-only manifest schema.
- `inventory-manifest.example.json` is a synthetic, content-free example.

No local inventory, profile snapshot, archive, or live configuration belongs in
this subtree.

## Allowed First-Pass Metadata

Each candidate record is limited to:

- a normalized path relative to an operator-selected source-root alias;
- byte size and modification epoch;
- an asset kind;
- `candidate` or `manual_review` status; and
- a `null` hash, because file contents are not read in this phase.

The source-root labels are aliases only. They are not environment-variable
instructions, local filesystem paths, secret locations, or permission to
inspect a profile.

Candidate concepts are limited to reusable source-like material such as skill
contracts, implementation source, deterministic helpers, tests, schemas,
templates, documentation, dependency manifests, and placeholder-only
configuration examples. Prompt material, fixtures, profile behavior documents,
and configuration examples always require manual content review in a later
authorized phase.

## Hard Exclusions

The manifest and any first-pass handoff exclude:

- profile contents, source text, prompt bodies, and configuration bodies;
- OAuth state, access or refresh tokens, credentials, secrets, and private
  keys;
- commands, command arguments, operational endpoints, and network targets;
- logs, transcripts, traces, sessions, cookies, and browser state;
- databases, caches, process state, runtime state, and generated artifacts;
- absolute paths, local secret paths, excluded-path details, and filesystem
  topology; and
- live configuration, private data, personal context, raw vaults, dossiers,
  notes, queues, receipts, and research data.

An exclusion is not made safe by changing or redacting only its filename.
Excluded paths are summarized by category and are never enumerated.

## Ownership and Authority

Hermes continues to own and update the `cstar-hub` OAuth profile and credential
lifecycle. This intake neither reads nor changes that state. That ownership is
legacy-v2 compatibility history only; it is not current CStar ownership,
readiness, routing, or transport authority.

The current host workflow is Codex-host Luna (`gpt-5.6-luna`, `max`). This
package never discovers, recommends, or substitutes a Hermes/MiniMax transport.

Local role boundaries are:

- CStar reserves deterministic implementation effects for bounded native work
  cells. Forge is permanently tombstoned.
- Researcher gathers evidence only through separately authorized source lanes.

An intake manifest is classification evidence only. It grants no worker
enrollment, source authority, execution, spend, provider selection, model
selection, profile mutation, or activation. It also grants no installation,
restart, deployment, or production authority.

## Review Flow

1. Prepare metadata using an independently authorized, read-only process
   outside this package.
2. Normalize every candidate to one approved source-root alias.
3. Apply all hard-exclusion categories before recording candidate metadata.
4. Mark review-sensitive candidates as `manual_review`.
5. Validate the manifest against `inventory-manifest.schema.json`.
6. Stop for operator review of the candidate list.
7. Treat any content inspection, sanitization, bundle creation, worker
   enrollment, source use, profile change, or activation as a separate gate.

The metadata schema cannot be reused as sanitized-bundle authority. No profile
becomes available to CStar, an implementation work cell, or Researcher merely because its metadata
appears in a valid manifest.
