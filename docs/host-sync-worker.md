# Host-side sync worker (mirror export ↓ + intent drain ↑)

The bridge that makes the cloud **CStar Command Console** (`cstar-console`,
deployed to Vercel, mailbox mode against MongoDB Atlas) live. Without it the
cloud mirror is empty and queued operator actions never take effect.

**Topology — Mongo is a mailbox, never the source of truth:**

- `proposal_mirror` — read replica of the host's `hall_research_proposals`,
  pushed **UP** by this worker. The console only reads it.
- `intent_queue` — operator decisions (accept / decline / refine / dispatch /
  edit) the console **appends**. This worker pulls them and applies them to
  `pennyone.db` **through the pipeline CLI** — the only sanctioned writer.

`pennyone.db` stays authoritative. Queued intents are "pending" in the cloud UI
until this worker applies them.

## Hard invariants

1. The **only** writer to `pennyone.db` is
   `<cstar-console>/scripts/sync_research_proposals.py`. The worker shells it
   with **argv arrays** (`execFile`, never `shell:true`, never string
   interpolation) — operator-supplied intent fields are passed as discrete argv
   elements, so they cannot inject commands.
2. The worker **writes** `proposal_mirror` (the up push) and **reads+updates**
   `intent_queue`. Mirror reads by the console never block on the worker.
3. `CSTAR_MONGO_URI` is a secret and is **never logged**. Use the redacted
   config view for any startup log.
4. Intents are applied **idempotently, exactly once**: each pending intent is
   atomically claimed (`findOneAndUpdate` → `processing`) before the CLI runs,
   then marked `applied` (with the CLI's JSON result) or `failed` (with captured
   stderr). A failing intent never crashes the loop or blocks the others.

## Run it

```bash
# Daemon (loops every CSTAR_SYNC_INTERVAL_MS, default 15s; clean SIGINT/SIGTERM shutdown)
node bin/cstar-sync-worker.js
npm run sync:worker

# One-shot (cron / systemd timer)
node bin/cstar-sync-worker.js --once
npm run sync:once
```

When `CSTAR_MONGO_URI` is unset the worker logs `config.missing` and exits `2`
without connecting.

## Environment

| Variable | Default | Purpose |
|:---|:---|:---|
| `CSTAR_MONGO_URI` | — (**required**, secret) | Atlas driver string (`mongodb+srv://…`). Never logged. |
| `CSTAR_MONGO_DB` | `cstar_console` | Database name. |
| `CSTAR_CONSOLE_DIR` | `~/cstar-console` | cstar-console checkout (holds `scripts/sync_research_proposals.py`). |
| `CSTAR_PIPELINE_SCRIPT` | `<CSTAR_CONSOLE_DIR>/scripts/sync_research_proposals.py` | Explicit CLI path override. |
| `CSTAR_PYTHON_BIN` | `python3` | Interpreter for the CLI. |
| `CSTAR_SYNC_INTERVAL_MS` | `15000` | Daemon tick interval. |
| `CSTAR_SYNC_CLI_TIMEOUT_MS` | `120000` | Per-CLI-invocation timeout. |
| `CSTAR_SYNC_RUN_SYNC` | `true` | Run `sync` (research-vault → pennyone.db) before each export. |
| `CSTAR_SYNC_RECONCILE` | `false` | Delete mirror docs absent from the latest export. |
| `CSTAR_SYNC_MAX_INTENTS` | `500` | Max intents drained per tick. |
| `CSTAR_MONGO_SELECT_TIMEOUT_MS` | `10000` | Mongo server-selection timeout. |

Collection names are fixed: **`proposal_mirror`** and **`intent_queue`**.

> **`gh` / `CSTAR_GH_MODE` note.** The pipeline's `accept` opens a per-spoke
> GitHub issue via `gh` (Track 2). The host must have `gh` authenticated, **or**
> set `CSTAR_GH_MODE=mock` (+ `CSTAR_GH_MOCK_STORE`) for dry runs. These are read
> by the CLI child process, so export them in the worker's environment (e.g. the
> systemd unit below). The pipeline also enforces its own guards — e.g. `accept`
> requires `gate_status ∈ {gate_passed, legacy_gate_passed}`. When a guard
> rejects an intent the CLI exits non-zero; the worker captures stderr and marks
> the intent `failed`.

## Each tick

1. **Drain (up):** claim each `intent_queue` doc with `status:'pending'`
   oldest-first, map to CLI argv, run it, set `applied`/`failed`.
2. **Refresh (optional):** run `sync` so freshly proposed items land in
   `pennyone.db` before export (`CSTAR_SYNC_RUN_SYNC`).
3. **Export (down):** run `list --history`, upsert every proposal into
   `proposal_mirror` by `proposal_id` (optionally reconcile deletions).

### Intent → CLI argv mapping

| action | payload | argv |
|:---|:---|:---|
| `accept` / `decline` / `refine` / `dispatch` | `{ notes }` or `null` | `<action> --id <proposal_id> --notes <notes ?? "">` |
| `edit` | `{ payload: <spec>, notes }` | `edit --id <proposal_id> --payload <JSON.stringify(spec)> --notes <notes ?? "">` |

Any action outside that set is rejected before shelling and the intent is
marked `failed`.

## systemd

A long-running daemon unit (survives reboots):

```ini
# /etc/systemd/system/cstar-sync-worker.service
[Unit]
Description=CStar host-side sync worker (proposal mirror + intent drain)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=craig
WorkingDirectory=/home/craig/CStar
# Keep the URI out of the unit file and process listing; load it from a 0600 file:
EnvironmentFile=/etc/cstar/sync-worker.env
Environment=CSTAR_CONSOLE_DIR=/home/craig/cstar-console
# Environment=CSTAR_GH_MODE=mock
# Environment=CSTAR_GH_MOCK_STORE=/home/craig/.cstar/gh-mock.json
ExecStart=/usr/bin/node /home/craig/CStar/bin/cstar-sync-worker.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/cstar/sync-worker.env` (mode `0600`, **not** committed):

```
CSTAR_MONGO_URI=mongodb+srv://…
CSTAR_MONGO_DB=cstar_console
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cstar-sync-worker.service
journalctl -u cstar-sync-worker -f
```

Prefer a timer instead of a daemon? Use `--once` from a
`systemd.timer`/cron entry on the same interval.

## Tests

- **Offline unit tests** (no Mongo, no host) — the intent→argv mapping (incl.
  `edit`), the mirror transform/upsert filter, and failure handling:
  `tests/unit/test_host_sync_intent.test.ts`,
  `tests/unit/test_host_sync_mirror.test.ts`,
  `tests/unit/test_host_sync_worker.test.ts`. Run via `npm run test:node`.
- **Lore** — `tests/features/host_sync_worker.feature`.
- **Live integration check** (env-guarded) — `scripts/mongo_smoke.mjs`
  (`npm run sync:smoke`): connects, round-trips one synthetic intent through a
  stubbed CLI into ephemeral collections, confirms it flips to `applied`, and
  confirms a mirror upsert/read. It is a no-op when `CSTAR_MONGO_URI` is unset
  and prints booleans/ids only — never the URI. Run it on the open-egress host.
