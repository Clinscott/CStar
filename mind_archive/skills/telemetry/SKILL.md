---
name: telemetry
description: "Use when recording mission telemetry, flares, and traces or broadcasting critical runtime alerts."
risk: safe
source: internal
---

# 🔱 SUBSPACE TELEMETRY SKILL (v1.0)

## When to Use
- Use when recording mission telemetry, flares, and traces or broadcasting critical runtime alerts.


## MANDATE
Manage real-time mission telemetry, flares, and traces to update the Hall of Records and increase sector Gravity.

## LOGIC PROTOCOL
1. **PULSE GENERATION**: Dispatch high-intensity "flares" for file-level activity.
2. **MISSION TRACING**: Record detailed audit traces (scores, justifications, status).
3. **DAEMON UPLINK**: Broadcast critical security alerts to the C* Daemon via WebSocket.
4. **INTELLIGENCE FEEDBACK**: Feed telemetry data back into the Gungnir Matrix for weighting.

## CONSTRAINTS
- Non-blocking execution (ultra-short timeouts).
- Every major action MUST leave a mark on the matrix.

## USAGE
`cstar telemetry --flare <path> [--agent <id>] [--action <id>]`
`cstar telemetry --trace --mission <id> --file <path> --metric <id> --score <val> --justification <text>`
