# Incremental Improvement and Durability Protocol

## Purpose

CStar improves through small, evidence-backed changes. The model is
Stockfish/fishtest: state one hypothesis, compare one candidate with a matched
baseline, retain the candidate only when the evidence supports it, checkpoint
it durably, and then repeat.

This is the active repository policy for iterative improvement.
`docs/campaigns/SOVEREIGNFISH_LEDGER.qmd` is a historical campaign ledger. Its
old instruction to make five unrelated improvements per session is not active
policy.

## Non-Negotiable Rules

1. Work on a named non-default branch with a draft pull request. Do not merge
   to `main`, `master`, deploy, or activate changed behavior without the
   required operator and repository review gates.
2. Test one coherent hypothesis at a time. Keep the change small enough to
   understand, review, benchmark, retain, or revert independently.
3. Record the baseline before editing. Run the same command, fixture, data,
   environment, and scoring method against the candidate.
4. Do not stack another change on an unverified candidate. Record unrelated
   findings as separate Hall Beads instead of expanding scope.
5. Retain a candidate only when its acceptance contract passes and the
   comparison shows improvement or an explicitly acceptable non-regression.
6. Push and read back the remote branch after every retained slice. A local
   commit, stash, temporary checkout, or uploaded loose Git object is not a
   durable checkpoint.
7. If publication is blocked, stop adding changes and create a verified
   recovery checkpoint before the workspace or thread can change.
8. Security, authority, privacy, and data-boundary regressions always outweigh
   a local score increase.

## The Improvement Loop

| Gate | Required evidence |
|---|---|
| 1. Scope | Hall Bead, acceptance criteria, target files, and explicit non-goals |
| 2. Hypothesis | Expected improvement and the metric or behavior that would prove it |
| 3. Baseline | Commit SHA, exact commands, environment notes, results, and known failures |
| 4. Candidate | One bounded implementation slice with no unrelated cleanup |
| 5. Verification | Focused contract/unit tests, relevant integration tests, and the matched benchmark |
| 6. Comparison | Baseline-versus-candidate result, tolerance, regressions, and confidence |
| 7. Decision | Retain, revise, or revert; do not hide an inconclusive or losing result |
| 8. Checkpoint | Commit, remote branch ref, read-back SHA, and draft PR state |

After Gate 8 succeeds, begin the next hypothesis from the new verified remote
head.

## Benchmark Discipline

- Prefer deterministic contract and unit tests for correctness.
- Use repeated trials and a declared tolerance for noisy timing, quality, or
  model-evaluation metrics. A single favorable run is not proof.
- Never change the benchmark, fixture, holdout, or scoring rule after seeing
  the candidate result. If the benchmark itself must change, treat that as a
  separate hypothesis.
- Record baseline failures separately from candidate regressions.
- Run the narrowest meaningful check first, then the relevant broader suite.
- Apply the Sterling triad to retained changes: Lore, Isolation, and Audit.
  Gungnir must improve or remain stable; an unavailable score must be reported
  as unavailable rather than invented.

## Durability States

Use exactly one state when handing work off:

- `DURABLE — REMOTE BRANCH VERIFIED`: the remote ref was read back and equals
  the intended commit.
- `DURABLE — RECOVERY CHECKPOINT VERIFIED`: a Git bundle, binary-capable patch,
  manifest, and checksums were stored outside the transient workspace and
  verified.
- `TRANSIENT ONLY — AT RISK`: neither durable condition is true.

Before a long test run, tool or approval transition, thread handoff, or end of
turn, reach a durable state. If GitHub publication is blocked, the recovery
package must contain enough material to reconstruct the exact tree without
relying on chat history.

## Review and Merge Boundary

A verified review branch is a staging area, not production authority. Keep the
pull request in draft until its declared gates pass. For the CStar v2 control
plane, the PC-backed Forge and Researcher integration remains a separate later
milestone, and CorvusEye red-team review is a mandatory pre-merge gate. Do not
run or claim that gate before the required local-PC context is available.
