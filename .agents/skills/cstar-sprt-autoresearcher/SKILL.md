---
name: cstar-sprt-autoresearcher
description: Run bounded host-only deterministic CStar lifecycle tests and detached Wald SPRT evidence.
tier: SKILL
risk: medium
intent_category: VERIFY
entry_surface: host-only
terminal_required: false
---

# SKILL: CStar SPRT AutoResearcher

This is a bounded host-native Forge validation lane. It is a proposal-only
evidence producer. It does not call CStar MCP, providers, source adapters,
network services, Hall, SQLite, Git, or deployment surfaces.

The runner executes one source-owned command as direct subprocess argv arrays
with shell=False. Callers cannot supply commands, modules, Node paths, or SPRT
hypotheses. Candidate source files remain confined under the checker root. The
runner performs one focused stage pass, then starts each full-lifecycle trial
as a new process. The fixed Wald regime is:

    alpha = 0.05
    beta = 0.10
    p0 = 0.01
    p1 = 0.20
    hard max_trials = 12
    hard per-process timeout = 120 seconds
    hard total wall deadline = 900 seconds

CLI limits may reduce but never exceed the three hard caps. Repeated successful
trials cross the stable boundary after the bounded default sample. A test
failure, timeout, total-deadline exhaustion, malformed TAP result, skipped
protected stage, missing protected stage, source drift, command drift, native
runtime incompatibility, invalid Gungnir evidence, or zero denominator fails
closed and cannot produce ACCEPTED.

## Deterministic Node selection

On WSL, Linux, and macOS, the runner probes the current PATH Node first and
then executable standard NVM installs under `~/.nvm/versions/node/*/bin/node`
in descending version order. At most 16 unique candidates are considered. Each
probe opens only an in-memory better-sqlite3 database, runs `SELECT 1`, and
closes it. It installs or rebuilds nothing and does not change PATH.

The first compatible executable is selected by absolute argv path. Evidence
records every attempted path, source, Node version, modules ABI, native package
version, result hashes, selected executable, and a selection-evidence SHA-256.
No compatible executable is a fail-closed result, never ACCEPTED.

## Protected lifecycle coverage

Every stage pass and every full-lifecycle trial must cover:

    request
    authorization
    synthetic_execute
    delivered_unverified
    independent_validation_record_result
    closeout_terminal

Coverage comes from explicit TAP comments named cstar-stage or from the
known focused CStar module names. The intended synthetic module set is:

    tests/unit/cstar-kernel-mcp/test_forge_runtime_lifecycle_gate.test.ts
    tests/unit/cstar-kernel-mcp/test_worker_job_lifecycle_binding.test.ts
    tests/unit/cstar-kernel-mcp/test_terminal_forge_validation_linkage.test.ts
    tests/unit/cstar-kernel-mcp/test_host_workflow_validation.test.ts

This module tuple is a hard source constant and cannot be widened through the
CLI. These modules exercise request and authorization, synthetic execution,
DELIVERED_UNVERIFIED delivery, independent validation and record-result
linkage, and terminal/closeout semantics. The module tests remain the system
under test; this runner does not mock them.

TAP evidence requires exactly one valid top-level terminal plan. Its count must
equal parsed top-level outcomes. The aggregate summary must have one each of
tests, pass, fail, skipped, todo, and cancelled; the full denominator must be
positive with zero failures, cancellations, skips, and todos. Duplicate,
conflicting, malformed, missing, or nonterminal plans fail closed. Nested
subtest plans remain scoped to their nested TAP streams.

## Invocation contract

Invoke scripts/run_cstar_workflow_sprt.py with:

    --checker-root ROOT
    --candidate-source PATH [PATH ...]
    [--max-trials N]
    [--timeout-seconds SECONDS]
    [--total-wall-seconds SECONDS]
    --output-dir RECEIPT_DIRECTORY

The output directory is optional. No receipt file is written without an
explicit output directory. When supplied, it must be inside the checker root
and contains receipt.json plus receipt.sha256. The default checker root is the
current worktree.

The fixed command is an argv array consisting of the selected absolute Node
path, `scripts/run-tsx.mjs`, Node test/TAP flags, and the four fixed modules.
There is no command or module CLI. The runner uses a fresh subprocess for every
trial and captures TAP stdout/stderr without executing a shell string.

Before lifecycle execution, the runner invokes the canonical read-only
TypeScript Gungnir calculus through one fixed, shell-free Node/tsx argv. Every
candidate whose extension is in `GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS` is
scored. Other candidates are retained as bounded exclusions with
`reason=unsupported_extension`; a `.feature` candidate is therefore visible,
not silently dropped. Candidate paths are resolved under the checker root and
symlink escapes fail closed.

The receipt declares:

    workflow_score       numeric score from 0 to 100
    sprt_verdict         ACCEPTED, REJECTED, or INCONCLUSIVE
    cstar_acceptance     always UNVERIFIED in this lane
    alpha, beta, p0, p1, LLR, and log boundaries
    passed, failed, and total trial denominator
    ordered trial hashes and command argv
    candidate source paths and SHA-256 digest
    protected stage coverage and stop reason
    duration and per-process TAP summaries
    hard and effective process/trial/total-wall limits
    selected Node path, version, modules ABI, and compatibility probes
    requested model gpt-5.6-luna with requested reasoning max
    actual model null unless an enforcing host reports it
    external-effects flags
    gungnir schema/version and 0..10 score scale
    gungnir arithmetic-mean overall score and scored/candidate/excluded counts
    per-file path, source SHA-256, canonical matrix, ordered breaches, and evidence SHA-256
    unsupported-file exclusions, formula, canonical engine/schema hashes
    fixed scorer-command hash, process output hashes, aggregate evidence SHA-256
    gungnir authority=heuristic_evidence_only

The Gungnir score is heuristic evidence alongside `workflow_score` and SPRT; it
never replaces either the independent validator or `cstar_record_result`. It
does not emit a baseline, delta, promotion rule, lifecycle acceptance, or
production-readiness claim. Missing, malformed, timed-out, hash-invalid, or
zero-scoreable Gungnir output makes the combined run non-accepted.

An ACCEPTED SPRT is detached evidence only. Independent
cstar_record_result is still required before CStar acceptance or terminal
closeout. This runner never calls that transition.

## Failure proposal boundary

When evidence fails, AutoResearcher emits at most eight bounded failed-stage
fingerprints and next_action=dispatch_repair_bead. It does not repair files,
edit the registry, retry live work, expand scope, or promote a proposal.
Any repair is a new authorized bead and a separate Forge lifecycle.
