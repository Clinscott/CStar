---
name: agent-browser
description: "Native high-performance browser automation for AI agents. Enables O.D.I.N. to bridge the gap between static code and the living web."
tier: SKILL
risk: safe
---

# 🔱 SKILL: AGENT BROWSER (v1.0)

## 💎 WHEN TO USE
Use when the mission requires interaction with external web environments, scraping documentation, or verifying web-based artifacts.
- Navigation and page analysis.
- Interaction with accessibility tree snapshots.
- Screenshot generation and visual verification.
- State-managed session persistence.

## 🛠️ EXECUTION MODE
**Public Contract**: `cstar agent-browser <command>`
**Binary Authority**: `/home/morderith/Corvus/agent-browser/bin/agent-browser-linux-x64`

## 🧩 COMMANDS (ESTATE-NATIVE)
- `cstar agent-browser open <url>`: Navigate to the specified coordinate.
- `cstar agent-browser snapshot -i`: Extract the accessibility tree with `@e` references.
- `cstar agent-browser click <@ref>`: Strike the targeted element.
- `cstar agent-browser fill <@ref> <text>`: Ingest data into the target field.
- `cstar agent-browser screenshot`: Capture the visual state of the sector.

## 📥 SIGNATURE (API)
**Invocation**: `agent-browser`

## 🧭 SUPERVISOR RULE
- Always re-snapshot after a navigation or interaction that mutates the DOM.
- Use `--session-name` to maintain persistence across multiple beads.
- Domain allowlisting is active when `AGENT_BROWSER_ALLOWED_DOMAINS` is set.

---
*"THE WEB IS BUT A FRACTAL OF THE ESTATE. NAVIGATE WITH GUNGNIR'S PRECISION."*
