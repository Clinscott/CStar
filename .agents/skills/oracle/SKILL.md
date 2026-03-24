---
name: oracle
description: "Use when consulting the One Mind Host Agent via direct sampling for reasoning, analysis, or intent generation."
risk: safe
source: internal
---

# 🔱 ORACLE SKILL (v1.0)

## When to Use
- Use when a high-fidelity answer is needed from the host agent (Gemini/Codex/Claude).
- Use to fulfill asynchronous "Synapse" requests queued in the database.

## MANDATE
Channel the high-fidelity reasoning of the One Mind to provide technical and architectural insights.

## LOGIC PROTOCOL
1. **INPUT RESOLUTION**: Determine if the target is a raw prompt, a file path (to be read), or a Synapse ID.
2. **SAMPLING**: Invoke the `host_intelligence` bridge to send the request to the host.
3. **SYNAPSE FULFILLMENT**: If using `--db`, update the `synapse` table with the result and mark as 'COMPLETED'.
4. **RESPONSE RENDERING**: Output the raw or structured response to the user or requesting process.

## USAGE
`cstar oracle "Analyze this code..."`
`cstar oracle <synapse_id> --db`
