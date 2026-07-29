# Repository and verification authority

## Decision

GitHub is CStar's remote source repository and pull-request review record. It
does not own CStar verification and must not block a pull request through an
automated status check.

The canonical acceptance command is:

```bash
npm run verify
```

It runs the repository diff check, TypeScript compilation, Node suite, Python
suite, and distribution contracts in a fixed fail-fast order. Every run writes
an atomic JSON receipt under `.cstar/verification/receipts/`. These receipts are
local operational evidence and are intentionally ignored by Git.

Run the suite on each operating system whose native behavior is being claimed.
A receipt records the actual platform; a Linux receipt is not evidence of a
Windows run, and vice versa.

## GitHub boundary

- Keep commits, branches, issues, and pull requests in GitHub.
- Do not use GitHub Actions as the verification authority.
- Do not configure required GitHub status checks for CStar.
- Do not treat the absence, failure, or success of a GitHub check as a CStar
  verification receipt.
- Publish a bounded slice only after its local receipt passes or after an
  explicit, documented operator exception.

## Researcher and Forge server boundary

The checked-in worker surfaces are integration contracts, not substitutes for
the mature local Researcher and Forge profiles.

Until the user-controlled server and approved profile source are available:

- worker-job tools remain default-off;
- an enabled worker-job surface may persist and display inert work orders only;
- every public worker-job response continues to report
  `execution_available: false`;
- CStar must not infer a provider, model, profile, OAuth flow, credential,
  command, endpoint, or host path;
- local profile intake remains metadata-only and grants no execution authority;
- missing enrollment, identity, tenant binding, or artifact-integrity gates
  block live execution.

Future server work must attach behind these contracts. It must not retrofit a
guessed Hermes implementation into CStar or weaken the current fail-closed
responses merely to make the integration appear complete.

## Rollback

The verification policy can be rolled back by reverting its bounded commit.
Local receipts may then be removed without affecting source history. Restoring
automated GitHub workflows requires a separate operator decision and must not
silently restore required status checks.
