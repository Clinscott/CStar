# CStar Local Validation Receipt

Use this receipt in PR bodies or PR comments when GitHub Actions are absent,
non-authoritative, skipped, failing, or not sufficient for Corvus validation.

```text
CStar bead id(s):
GitHub issue:
Packaging mode: PR_REQUIRED | LOCAL_EXCEPTION_WITH_FOLLOWUP_PR | NO_GITHUB_DOCS_ONLY
Branch:
Base branch:
Target branch:
Changed-file scope:
Local validation commands/results:
CStar validation result id(s):
CStar Console witness receipt/status:
PMT reviewer verdict:
MCP status/degraded fallback:
Risk notes:
GitHub workflow status:
GitHub Actions note: optional/non-blocking unless separately opted in
Merge-gated statement:
```

Validation authority is PMT local validation evidence plus CStar validation
result ids plus CStar Console witness receipts/status. GitHub Actions are
optional and non-blocking unless a future repo explicitly opts into them through
approved policy.
Existing Actions failures are advisory by default and must not block PMT/CStar
validation unless the repo has separately opted into Actions-authoritative
gates.
