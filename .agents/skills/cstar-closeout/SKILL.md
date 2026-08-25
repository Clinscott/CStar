---
name: cstar-closeout
description: Prepare and execute evidence-backed Corvus/CStar session closeout. Use when the operator asks to wrap up, save the session, write a handoff, summarize current state, stage an approved manifest, commit approved work, or close a CStar bead without reviving the retired wrap_it_up workflow.
---

# CStar Closeout

Preserve the useful end state of the retired Wrap It Up workflow while keeping
evidence, handoff writing, lifecycle closeout, staging, commit, and push as
separate gates.

## Workflow

1. Determine the exact repository and lifecycle scope. Use `cstar_handoff` for
   resumed work and the mapped PMT only as a project information repository.
2. Run `scripts/inspect_closeout.py --root <repo>` for a read-only Git snapshot.
   Add `--include-path <path>` only for artifacts whose hashes belong in the
   packet. Never include secrets or raw high-volume evidence.
   For a Codex activation gate, run
   `.agents/skills/cstar-closeout/scripts/inspect_codex_activation.py --root <CStar> --estate-root <Corvus>`.
   It checks source, personal staging, installed lineage, marketplace uniqueness,
   and static MCP wrapper precedence without reading secret values or mutating
   host state. It always leaves live proof and activation operator-gated.
3. Reconcile requirements against current proof. Separate `SOURCE`,
   `INSTALLED`, `LIVE`, and `PRODUCTION`; never promote one evidence class into
   another.
4. Produce one decision-ready packet containing:
   - objective and lifecycle id;
   - exact head, branch, dirty-root isolation, and approved file manifest;
   - validation commands, results, exclusions, failures, and residual risks;
   - requested versus actual model identity when reported;
   - next action and every remaining operator gate.
5. Default to returning the packet without mutating files or Git. Write a
   canonical handoff file only when the operator explicitly asks to write or
   update it.
6. Record validation/lifecycle changes through `cstar-kernel` only after the
   independent evidence agrees. Send the mapped PMT a compact informational
   `STATE_UPDATE` after meaningful project work.

## Git gates

- Never run `git add .`, `git add -A`, or stage outside an approved manifest.
- Stage only after an explicit staging grant; show the exact staged paths and
  staged diff summary.
- Commit only after an explicit commit grant and only the approved staged
  manifest. Do not amend or rewrite history unless separately authorized.
- Push is a separate operator gate. Merge, deploy, restart, installation,
  destructive cleanup, and production claims are separate gates too.
- Preserve unrelated dirty or untracked files. If ownership overlaps, stop and
  report the exact paths.

## Failure classes

- `EVIDENCE_INCOMPLETE`: required validation or lifecycle proof is missing.
- `DIRTY_SCOPE_CONFLICT`: approved work overlaps operator-owned changes.
- `LIFECYCLE_UNAVAILABLE`: the kernel transition is missing or degraded.
- `MANIFEST_DRIFT`: staged/current paths differ from the approved manifest.
- `ACTIVATION_GATED`: source is ready but install/restart/live proof is not.
- `MARKETPLACE_CONFLICT`: more than one `corvus-local` root makes plugin
  selection ambiguous and must be reconciled through backed-up supported Codex
  operations.

Do not compensate for a failure by invoking legacy autonomous repair, model
fulfillment, AutoBot, Host Governor, One Mind, Ravens mutation, or direct Hall
writes. Route implementation through Forge and research through Researcher.
