# Hermes Spoke Daemon Protocol

## Overview

Each spoke (moonshot, fallowshallowrpg, etc.) has a Hermes daemon — a persistent `hermes --profile <spoke> chat` process that communicates with the main Corvus orchestrator via JSON messages over stdin/stdout.

## Architecture

```
Corvus (main Hermes)
  └── run-daemons.py (orchestrator)
        ├── spawns spoke-daemon.sh per spoke
        │     └── hermes --profile <spoke> chat
        ├── writes JSON to <spoke>/.hermes-daemon/stdin.fifo
        ├── reads JSON from daemon's stdout
        └── logs all traffic to ~/.hermes-daemon-logs/<spoke>/daemon-comm.log
```

## Directory Structure (per spoke)

```
~/Corvus/<spoke>/.hermes-daemon/
├── daemon.log          # daemon's own log (stdout/stderr tee)
├── hermes.log          # hermes CLI output
├── stdin.fifo          # named pipe — Corvus writes JSON here
├── stdout.fifo          # (daemon writes JSON here via stdout capture)
├── stop                 # touch this file to signal graceful stop
├── reports/
│   └── YYYY-MM-DD.md    # daily research report (written by daemon)
└── skills/             # skills written by the daemon during research
```

## Message Protocol

All messages are JSON, one object per line. No delimiters needed — one JSON object per line.

### Corvus → Daemon (stdin.fifo)

**Start research task:**
```json
{"type":"start","payload":{"topic":"JPL HPSC architecture update for moonshot","lanes":["flight_hardware","local_model"],"rounds":3,"tools":["web_search","x_api","file_read"]}}
```

**Ping (health check):**
```json
{"type":"ping"}
```

**Stop daemon:**
```json
{"type":"stop"}
```

### Daemon → Corvus (stdout)

**Research report:**
```json
{"type":"report","payload":{"topic":"JPL HPSC architecture update for moonshot","content":"## Findings\n\n...","skills_written":["hpsc-power-profiling"],"findings":["HPSC 100x throughput claim is compute-memory coupled","Local model fallback required for Mars-distance comm blackout"]}}
```

**Pong (health check response):**
```json
{"type":"pong","payload":{"spoke":"moonshot"}}
```

**Error:**
```json
{"type":"error","payload":{"reason":"hermes process exited unexpectedly"}}
```

**Stopped:**
```json
{"type":"stopped","payload":{}}
```

## Daemon Lifecycle

1. **Spawn:** `bash spoke-daemon.sh <spoke> <profile>` — runs as subprocess managed by `run-daemons.py`
2. **Startup:** Daemon sets up FIFO, logs startup, enters message pump
3. **Research loop:** For each `start` message:
   - Parse topic/lanes/rounds
   - Feed research prompt to `hermes --profile <spoke> chat`
   - Capture output, extract report JSON
   - Write report to `.hermes-daemon/reports/<date>.md`
   - Respond with `{type:"report",...}`
4. **Stop:** On `stop` message or `stop` file, daemon writes final log and exits
5. **Orphan handling:** If daemon exits unexpectedly, orchestrator logs it and marks daemon as dead

## Skills Auto-Writing

During research, if the daemon discovers a pattern or technique worth codifying, it writes a skill:

```
~/.hermes/profiles/<spoke>/skills/research/<new-skill>/SKILL.md
~/.hermes/profiles/<spoke>/skills/research/<new-skill>/scripts/
```

The skill gets YAML frontmatter:
```yaml
---
name: <new-skill>
description: ...
tier: SKILL
risk: low
auto_generated: true
generated_at: YYYY-MM-DD
spoke: <spoke>
---
```

Corvus reads these via `walkSpokeSkills()` on next Hall scan.

## Log Aggregation

`~/.hermes-daemon-logs/<spoke>/daemon-comm.log` captures every send/receive in order. Useful for:
- Debugging research quality
- Auditing what each spoke decided to pursue
- Training data for improving research prompts

## Orchestrator Commands

```bash
# Start all daemons
python3 run-daemons.py start --spokes all

# Start specific daemons
python3 run-daemons.py start --spokes moonshot,corvuseye

# Stop all
python3 run-daemons.py stop --spokes all

# Status check
python3 run-daemons.py status

# Run one research cycle
python3 run-daemons.py run

# Send one-shot task
python3 run-daemons.py send --spoke moonshot --topic "..."
```

## Corvus Integration

Main Corvus (this Hermes instance) reads reports from:
- `~/Corvus/<spoke>/.hermes-daemon/reports/<date>.md` (written by daemon)
- `~/wiki/queries/<spoke>-daemon-<date>.md` (alias/written by orchestrator)

Corvus also reads skills auto-written by daemons via the existing `walkSpokeSkills()` scan of `~/.hermes/profiles/<spoke>/skills/`.