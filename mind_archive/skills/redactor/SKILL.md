---
name: redactor
description: "Use when masking secrets in logs, reports, and terminal output before data leaves the system."
risk: safe
source: internal
---

# 🔱 SECRET REDACTION SKILL (v1.0)

## When to Use
- Use when masking secrets in logs, reports, and terminal output before data leaves the system.


## MANDATE
Protect the repository from accidental secret exposure by automatically masking sensitive values (API keys, tokens) in logs, reports, and terminal output.

## LOGIC PROTOCOL
1. **VAULT SYNCHRONIZATION**: Load sensitive keys and values from the sovereign Vault.
2. **PATTERN FORGING**: Pre-compile regex patterns for all active secrets, sorted by length to prevent partial matches.
3. **MASKING**: Scan provided text and replace sensitive strings with themed placeholders (e.g., `[REDACTED_GEMINI_KEY]`).
4. **INTEGRITY ENFORCEMENT**: Ensure that no raw secret ever reaches the stdout or Hall of Records.

## USAGE
`cstar redactor --text <raw_content>`
`cstar redactor --file <path>`
