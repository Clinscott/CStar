# Legacy control-plane automation retirement

Status: proposed by the implementation PR for #46. This document grants no runtime authority.

## Decision

CStar remains historical source while the native state-machine boundary is designed. GitHub may validate repository policy, but it may not dispatch an agent, call a model provider, publish a host bundle, install a runtime, or activate CStar.

The active automation surface is one validation-only workflow on a GitHub-hosted macOS runner. It uses only Git and shell utilities already present on the runner. It has read-only repository permission and contains no marketplace action, package installation, secret, schedule, manual runtime trigger, or issue/comment trigger.

## Removed active surfaces

- Six Gemini workflows, including hourly triage and issue, comment, pull-request, and review dispatch.
- The tag and manual host-distribution release workflow.
- The Node, Python, npm, pip, Bubblewrap, SQLite rebuild, Forge runtime, provider, and release-bundle paths from active CI.

Git history preserves the retired implementation. Nothing is copied into an archive directory or future checkout.

## Legacy issue decisions

| Issue | Decision | Reason |
| --- | --- | --- |
| #21 | Superseded | It exists only to test Gemini automation, which is retired. |
| #23 | Superseded | MCP spoke-metadata packaging belongs to the retired host-control runtime. |
| #25 | Narrowed | Keep GitHub as a human review ledger; discard PMT, CStar Console, and legacy result-ID authority. |
| #35 | Superseded | GUNGNIR scoring and the Crucible gate are replaced by explicit native conformance checks. |
| #37 | Superseded | Forge, Hermes, MiniMax, and provider routing are outside the native dependency-free architecture. |
| #41 | Superseded | MCP Augury and its sidecar are retired; legitimate deterministic trace semantics may be specified later in CStarCore. |

These are disposition records, not activation or migration instructions.

## Simplification result

| Surface | Before | After |
| --- | ---: | ---: |
| Active workflow files | 8 | 1 |
| Provider or autonomous workflow files | 6 | 0 |
| Host-distribution publishers | 1 | 0 |
| Scheduled workflows | 1 | 0 |
| Marketplace actions in the retained workflow | n/a | 0 |
| Package or runtime installers in the retained workflow | n/a | 0 |
| Runtime entry points added | 0 | 0 |
| Daemons added | 0 | 0 |
| Compatibility layers added | 0 | 0 |

The smallest alternative considered was deleting all workflows. One inert policy check remains because it makes regression visible without becoming a runtime dependency.

## K.I.S.S. and sovereignty proof

- One workflow, one job, two steps.
- No third-party dependencies, vendored code, binary artifacts, provider SDKs, language setup actions, or dynamic plugin downloads.
- No workflow can write repository content, issues, pull requests, releases, packages, or deployments.
- No workflow can invoke CStar, Organism, a skill, a model, a scheduler, or a host adapter.
- The workflow's lifecycle is simply fetch the exact revision, validate the active surface, and exit.

Any future native build job must be a separate reviewed change and must invoke only checked-in first-party Swift source plus Apple toolchains already present on the runner.
