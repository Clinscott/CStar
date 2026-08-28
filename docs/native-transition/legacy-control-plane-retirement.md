# Legacy GitHub automation retirement

Status: proposed by the implementation PR for #46. This document grants no runtime authority.

## Decision

GitHub is a human repository and pull-request ledger only. CStar has no GitHub Actions workflows, hosted runners, marketplace actions, scheduled jobs, provider dispatch, release publishers, or required external status checks.

All validation runs locally and offline on the operator-controlled macOS or iOS development environment, using checked-in first-party source and Apple toolchains already supplied by the operating system. Validation results may be recorded in the pull-request conversation for human review; GitHub does not execute or decide them.

## Removed active surfaces

- All eight GitHub Actions workflow files.
- Six Gemini workflows, including hourly triage and issue, comment, pull-request, and review dispatch.
- The tag and manual host-distribution release workflow.
- The Node, Python, npm, pip, Bubblewrap, SQLite rebuild, Forge runtime, provider, and release-bundle paths from active automation.

Git history preserves the retired implementation. Nothing is copied into an archive directory or future checkout.

## Legacy issue decisions

| Issue | Decision | Reason |
| --- | --- | --- |
| #21 | Superseded | It exists only to test Gemini automation, which is retired. |
| #23 | Superseded | MCP spoke-metadata packaging belongs to the retired host-control runtime. |
| #25 | Narrowed | Keep GitHub as a human review ledger; discard PMT, CStar Console, and legacy result-ID authority. |
| #35 | Superseded | GUNGNIR scoring and the Crucible gate are replaced by explicit OS-local conformance checks. |
| #37 | Superseded | Forge, Hermes, MiniMax, and provider routing are outside the native dependency-free architecture. |
| #41 | Superseded | MCP Augury and its sidecar are retired; legitimate deterministic trace semantics may be specified later in CStarCore. |

These are disposition records, not activation or migration instructions.

## Simplification result

| Surface | Before | After |
| --- | ---: | ---: |
| GitHub Actions workflow files | 8 | 0 |
| Provider or autonomous workflows | 6 | 0 |
| Host-distribution publishers | 1 | 0 |
| Scheduled workflows | 1 | 0 |
| Hosted validation jobs | present | 0 |
| Required external checks | not used | 0 |
| Runtime entry points added | 0 | 0 |
| Daemons added | 0 | 0 |
| Compatibility layers added | 0 | 0 |

## K.I.S.S. and sovereignty proof

- Delete every workflow; retain no replacement.
- Add no executable source, runner configuration, package, compatibility facade, or hosted gate.
- Keep GitHub limited to human review, discussion, and immutable history.
- Run future checks only from small first-party local commands that work with networking disabled.
- Treat external app results as non-authoritative noise, never as a merge or runtime gate.

The earlier one-workflow alternative was rejected after the sovereignty rule was clarified: even a read-only hosted check is unnecessary machinery and outside execution.

Any future native validation command must be reviewed as product source, have one purpose, use only first-party Swift plus Apple OS/toolchain APIs, and pass a deletion pass before acceptance.
