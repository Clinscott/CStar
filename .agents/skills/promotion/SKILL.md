---
name: promotion
description: "Use when registering, hashing, verifying, and tracking promoted skills before sovereign admission."
risk: safe
source: internal
---

# 🔱 SKILL PROMOTION REGISTRY SKILL (v1.0)

## When to Use
- Use when registering, hashing, verifying, and tracking promoted skills before sovereign admission.


## MANDATE
Manage the verification and promotion of agent capabilities, ensuring every skill is audited and hashed before entering the sovereign repository.

## LOGIC PROTOCOL
1. **HASH VERIFICATION**: Generate SHA-256 hashes for all files associated with a skill promotion.
2. **REGISTRY UPDATE**: Record promotion metadata (timestamp, status, file hashes) in `.agents/promotion_registry.json`.
3. **SOVEREIGNTY CHECK**: Verify if a specific skill has been officially promoted and verified.
4. **INTEGRITY ENFORCEMENT**: Prevent the execution of untrusted or modified skills.

## USAGE
`cstar promotion --register --skill <name> --files <path1> <path2>`
`cstar promotion --verify --skill <name>`
