---
name: cachebro
description: "Use when managing intelligent caching strategies for build artifacts, API responses, and computation results."
tier: SKILL
risk: safe
source: internal
---

# 🔱 CACHEBRO: INTELLIGENT CACHE MANAGEMENT (v1.0)

## When to Use
- Use when implementing or managing caching layers for build artifacts, API responses, or expensive computations.
- Use when diagnosing cache invalidation issues or optimizing cache hit rates.

## MANDATE
Provide intelligent cache management capabilities that reduce latency and API quota consumption across the framework.

## LOGIC PROTOCOL
1. **CACHE AUDIT**: Inspect current cache state and hit/miss ratios.
2. **STRATEGY SELECTION**: Choose appropriate caching strategy (LRU, TTL, or content-hash).
3. **INVALIDATION RULES**: Define clear invalidation triggers based on file mutation or time.
4. **TELEMETRY**: Report cache performance metrics for Gungnir scoring.

## USAGE
Accessed via the Node.js runtime or:
`cstar cachebro --status`
`cstar cachebro --clear`
