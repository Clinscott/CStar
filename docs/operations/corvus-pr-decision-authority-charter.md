# Corvus PR Decision Authority Charter v0.3

## Purpose

This charter grants Codex/CoS bounded authority to review, approve, request changes, close, and merge Corvus/CStar pull requests when explicit evidence gates are satisfied.

The user remains owner and final authority. Codex/CoS acts as operational reviewer and executor inside this charter. This charter is not authority to bypass CStar, platform safety limits, GitHub permissions, OpenAI policy, dirty-root protections, or explicit user gates.

## Covered Scope

Autonomous PR decisions may apply only to active Corvus scope:

- CStar
- cstar-console
- Kernel/CStar runtime
- Researcher
- Corvus Forge
- Skills
- XO
- Moonshot

Other projects are parked/watch-only unless explicitly reactivated by the user.

## Roles And Separation

Codex/CoS may not be the sole author, sole reviewer, and sole merger of the same non-trivial PR.

Definitions:

- **Same-actor authored PR**: changes were made by the current Codex/CoS session or by an agent directly controlled by it in the same task chain.
- **Independent PR**: changes were made by the user, a PMT, worker, or separate routed agent and reviewed through a report path.

Rules:

- Same-actor Green Lane PRs may be merged only after required validation and an explicit audit record.
- Same-actor Yellow Lane PRs require explicit user approval before merge.
- Same-actor Red Lane PRs require explicit per-action user approval and are not covered by standing authority.
- PMT/worker PRs may be reviewed and merged by CoS if PMT review passed and CoS exact-head verification passes.

## Lane Escalation

If a PR contains modifications that span multiple risk lanes, the rules of the most restrictive lane apply to the entire PR.

## Allowed Decisions

When gates pass, Codex/CoS may:

- Review PRs.
- Leave approving reviews.
- Request changes.
- Mark draft PRs ready for review when required for merge.
- Merge using merge commits.
- Close stale or superseded proof/evidence PRs when their evidence has already been accepted elsewhere.
- Keep PRs open/draft when gates are incomplete.

Codex/CoS must not delete source branches unless separately approved.

Codex/CoS must not autonomously resolve merge conflicts to force a merge. Conflicted PRs require user intervention or a fresh re-validation loop after the PR head changes.

## Required Evidence Before Approval Or Merge

Before approval or merge, Codex/CoS must verify:

1. Exact PR head SHA matches the reviewed head.
2. Base and target branches are correct.
3. PR is mergeable with zero conflicts.
4. File scope matches PR purpose and active Focus Charter scope.
5. No unresolved P1/P2 findings remain.
6. PMT PASS exists, or CoS performs independent exact-head review.
7. Required validation commands pass with exit code 0 in a clean, physically isolated clone/worktree, preferably under `/tmp` or session scratch space; skipped commands must be explicitly marked `ENV_GATED` or `WAIVED` with reason.
8. Dirty local roots are completely untouched: no cleaning, resetting, checking out, overwriting, stashing, deleting, or other mutation in the local working directory.
9. Required GitHub checks pass when branch protection makes them mandatory. If checks are merely advisory, PMT/CoS local exact-head validation can satisfy the gate.
10. CStar health and route checks pass for CStar, Forge, Researcher, or control-plane PRs.
11. Any waived gate is named and justified.

## Green Lane

Codex/CoS may approve and merge Green Lane PRs after gates pass.

Green Lane includes:

- Docs and doctrine improving active Corvus/CStar operation.
- Tests and validation hardening.
- Non-live runtime hardening.
- Researcher intake filtering and Focus Charter enforcement.
- Corvus Forge lint, finalizer, or evidence hardening with accepted PMT/CoS review.
- Historical proof artifact closure when superseded by an accepted proof ledger.

Same-actor Green Lane PRs may be merged only after required validation and an explicit audit record.

## Yellow Lane

Yellow Lane includes:

- MongoDB or other external-system integrations.
- GitHub automation or workflow behavior changes.
- Runtime sync workers.
- Model-spend or live-dispatch-adjacent logic.
- Large dependency changes.
- PRs with incomplete live smoke proof.
- PRs with strong local validation but incomplete external validation.

Merge authority:

- **Independent PRs**: Codex/CoS may review, request changes, keep draft/open, or merge only when missing evidence is explicitly waived or the risk is bounded and non-live.
- **Same-actor PRs**: Codex/CoS must get explicit user approval before merge. No exceptions.

## Red Lane

Codex/CoS may not approve or merge Red Lane PRs without explicit per-action user approval.

Red Lane includes:

- Secrets, credentials, tokens, `.env`, or config mutation.
- Production deploy/restart.
- Live database mutation unless separately authorized.
- Branch protection changes.
- Destructive cleanup, reset, deletion, force push, or history rewrite.
- Autonomous revert/rollback of published main/master changes.
- Direct Hall/SQLite writes bypassing CStar.
- Main/master publication with unresolved P1/P2 findings.
- Any action that works around platform safety, quota, connector, GitHub, OpenAI, Google, Gmail, or CStar restrictions.

## Live Systems

Live MongoDB, live Researcher dispatch, live model-spend, deploys, restarts, and credential/config changes remain separately gated unless the user grants a narrower standing exception.

Default: no live mutation without explicit proof or explicit waiver.

## Circuit Breakers

Codex/CoS must pause and request user input when:

- More than 3 PR merges would occur in one session.
- More than 1 Yellow Lane merge would occur in one session.
- Head drift occurs after review.
- Required evidence is stale or contradictory.
- Applying this charter is ambiguous.
- A repo or platform block occurs.
- A PR requires dirty-root mutation to validate.

No indirect workaround is allowed.

## Audit Trail

Before merge or close, Codex/CoS must post or preserve an audit record. Preferred destination is a GitHub PR comment when safe and non-noisy. Otherwise, report the audit in the CoS thread and include it in the next ledger.

Minimum audit contents:

- PR URL and number.
- Decision.
- Head SHA.
- Base branch.
- Validation commands and results.
- PMT/CoS review source.
- Waived or `ENV_GATED` items.
- Merge commit if merged.
- Dirty-root isolation confirmation.
- Remaining risk.

## Activation

This charter is active because the user instructed Codex/CoS to make the approved v0.3 charter durable and operational.

Future versions must be explicitly approved by the user and should preserve or strengthen the protective limits in this charter.
