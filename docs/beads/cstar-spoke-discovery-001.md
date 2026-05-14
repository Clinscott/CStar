# BEAD-CSTAR-SPOKE-DISCOVERY-001 — Design Record

**Current Intent**: Extend the CStar kernel MCP and CLI capability-discovery surface so that spoke-local skills (and the spoke's four-file journal state) are first-class discoverable by any host agent operating inside the Corvus Estate. The kernel **announces** spoke capabilities; the **host agent** (Claude / Codex / Gemini) executes them per Host-Native First (`AGENTS.qmd` §0). No new schema. No new write path. Read-only spoke awareness.

**Anchor**: `BEAD-CSTAR-SPOKE-DISCOVERY-001`, kernel-anchored (no spoke).

**Companion Specs**:
- `docs/integrations/cstar_capability_discovery_api.md` — existing `cstar manifest` / `cstar skill-info` contract this bead extends.
- `docs/architecture/SKILL_REGISTRY.md` — Universal Skill Registry authority manifest.
- `docs/architecture/HALL_PER_SPOKE_TRAY.md` (PROPOSED, separate bead) — per-spoke Hall anchoring; this bead intentionally does **not** depend on it landing first.
- `CorvusEye/.agents/skills/usb-forge-contract-verify/SKILL.md` — first conforming spoke-local skill; serves as the v1 reference fixture.

**Operating Model**: Dia-Logos.

---

## 1. Why this bead, why now

A spoke (CorvusEye) has shipped its first spoke-local skill: `usb-forge-contract-verify` at `<spoke>/.agents/skills/usb-forge-contract-verify/SKILL.md`. Today the kernel cannot see it. `cstar manifest --json` reads only the kernel's `.agents/skill_registry.json`; `cstar skill-info` resolves only kernel-registered IDs. The MCP layer has no spoke-aware discovery tool.

This creates a discovery hole that grows with every spoke skill we ship. The hub-and-spoke estate model already commits to hosting independently-evolving spokes; capability discovery has to match that model or we will silently centralise back into the kernel registry — which is precisely what the per-spoke architecture exists to avoid.

Two existing seams make this cheap to fix:
- `hall_mounted_spokes` already knows every linked spoke's `root_path`, `trust_level`, `write_policy`, and `mount_status`. No new schema.
- `cstar manifest` already has a registry-merge-with-Commander pattern (`docs/integrations/cstar_capability_discovery_api.md`). Spoke-walk slots in as a third merge source.

The bead does not touch Hall writes, does not touch the war-game scoring path, and does not touch `cstar_record_result`. It is a read-only surface delta.

---

## 2. Open Questions (Dia-Logos)

### Q1. Where do spoke-local skill manifests live on disk?

**Ruling.** Primary: `<spoke_root>/.agents/skills/<skill_id>/SKILL.md` walk, mirroring the kernel's `.agents/extension/skills/` convention. Optional overlay: `<spoke_root>/.agents/skill_registry.json` if a spoke wants per-spoke registry metadata (tier, risk, ownership). When both are present, registry metadata supplements the SKILL.md frontmatter; on conflict, the registry wins because it is structured.

CorvusEye already conforms (`CorvusEye/.agents/skills/usb-forge-contract-verify/SKILL.md` with YAML frontmatter). No spoke is required to ship a registry — SKILL.md alone is sufficient.

### Q2. Namespace strategy for IDs

**Ruling.** All spoke skills are namespaced as `<spoke_slug>:<skill_id>` (e.g. `corvuseye:usb-forge-contract-verify`). Hub IDs stay bare (`empire`, `gungnir`, `restoration`). The colon is reserved as the spoke separator and is rejected in bare IDs at validation time. This makes hub/spoke distinction lexically unambiguous in `manifest` output and `skill-info <id>` resolution.

Collisions are impossible by construction: hub IDs cannot contain `:`; spoke IDs must contain exactly one `:`. The kernel's existing `resolveCapabilityById` gains a single branch on the presence of `:`.

### Q3. Does the kernel execute spoke skills or just announce them?

**Ruling. Announce only in v1.** This aligns with the Supreme Directive (`AGENTS.qmd` §0 — Host-Native First) and the existing `entry_surface: host-only` pattern in the capability discovery API. The kernel returns the SKILL.md content + invocation contract; the calling host agent (Claude Code, Codex, Gemini CLI) reads it and runs the skill in its own session at the spoke's working directory.

Kernel-backed spoke dispatch (via `RuntimeDispatcher` with a spoke-aware adapter) is a follow-up bead, not in scope here. v1 explicitly does **not** spawn processes, exec scripts, or schedule jobs on behalf of spokes.

**Operator ratification 2026-05-13**: announce-only is acceptable provided the host agent runs the announced skill. The MCP response shape therefore includes an `invocation` block that the host can act on directly without further kernel calls — see §4.2.

### Q4. What MCP surface does this add?

**Ruling.** Three new MCP tools, all additive:

| Tool | Args | Returns |
|---|---|---|
| `cstar_manifest` | `{ scope?: 'hub' \| 'spoke' \| 'all' (default 'hub'), spoke?: slug }` | Capability catalog with `source: 'hub' \| 'spoke'` and spoke-namespaced IDs. |
| `cstar_skill_info` | `{ id: string, spoke?: slug }` | Per-skill contract view including `documentation` (SKILL.md content), `invocation` (working_dir, command, agent_hint), `authority`, `validation`. |
| `cstar_spoke_journal` | `{ spoke: slug }` | Four-file journal state: `memory_md`, `tasks_md`, `wireframe_md`, `dev_journal_md`, each `{ present, mtime, sha256, size_bytes, summary? }`. |

CLI surface gains corresponding flags:
- `cstar manifest --scope=<hub|spoke|all> [--spoke <slug>] --json`
- `cstar skill-info <id> [--spoke <slug>] --json`
- `cstar spoke journal <slug> [--json]` (new subcommand)

### Q5. How does the kernel locate spoke roots?

**Ruling.** Walk `hall_mounted_spokes` rows where `mount_status='active'` AND `trust_level != 'quarantined'`. From each row, read `root_path` and walk `<root_path>/.agents/skills/` for SKILL.md files. No new schema, no new config file, no new CLI registration step. A spoke that has been `cstar spoke link`-ed and is in good standing is automatically discoverable.

Quarantined spokes are excluded from `scope='spoke'` and `scope='all'` listings. They are still resolvable by explicit `cstar_skill_info { id: 'quarantined-slug:foo' }` calls with a `validation: 'quarantined'` flag so operators can audit a quarantined spoke's surface without un-quarantining it.

### Q6. Trust enforcement on read

**Ruling.** Read is unrestricted for active + non-quarantined spokes. No `write_policy` gate (this surface has no writes). The kernel does **not** require a spoke to be `read_write` to advertise its skills — `read_only` spokes are still discoverable, since announcing a skill is not the same as accepting a Hall write from it.

A future Q (deferred): should `cstar_skill_info` carry an `invocation_authorized` boolean derived from caller trust + spoke trust? Out of scope for v1; the host agent makes the final call.

### Q7. Journal-awareness payload shape (S3)

**Ruling.** `cstar_spoke_journal({ spoke })` returns the four AGENTS.md-mandated files. The four file paths are conventionally relative to the spoke root:

| File | Relative path | Summary derivation |
|---|---|---|
| `memory_md` | `.agent/memory.md` | First H1 (`# …`) plus first non-blank paragraph, capped at 280 chars. |
| `tasks_md` | `tasks.md` | First H1 plus open-task count (`grep -c '^- \[ \]'`). |
| `wireframe_md` | `wireframe.md` | First H1; `prominent_functions: string[]` extracted from `### Prominent Functions` section if present. |
| `dev_journal_md` | `DEV_JOURNAL.md` | First H1; last entry timestamp if discoverable. |

Each entry: `{ present: bool, path: string, mtime?: number, sha256?: string, size_bytes?: number, summary?: string, validation?: 'invalid'|'missing'|'ok' }`. Absent files report `{ present: false }`; the kernel never creates the file (AGENTS.md tells the host agent to do that at session start).

**Note**: CorvusEye uses `.agent/` (singular) per its AGENTS.md. CStar's own convention may differ in other spokes; the kernel reads both `.agent/memory.md` and `.agents/memory.md` and prefers whichever exists. If both exist, the spoke is in a drift state and the response includes `validation: 'drift'` with both paths reported.

### Q8. Failure modes — what does the kernel report when things are off?

**Ruling.** The kernel **reports**; it never mutates a spoke's filesystem on the read path.

| Condition | Response |
|---|---|
| Spoke `root_path` no longer exists on disk | `mount_status_drift: true`, `skills: []`, journal returns all `{ present: false }`. Operator-actionable. |
| Spoke directory exists but no `.agents/skills/` | Empty `skills: []` with `note: 'no_skills_directory'`. Not an error. |
| SKILL.md frontmatter is malformed (invalid YAML) | Skill included with `validation: 'invalid'`, `validation_reason: '<parser-error>'`, `documentation` still returned raw. Drop nothing silently. |
| Skill ID collides with hub registry ID | Spoke skill is namespaced `<slug>:<id>` regardless, so collision is impossible — but the response includes `note: 'shadows_hub_id'` if the bare ID matches a hub entry, for operator awareness. |
| Quarantined spoke | Excluded from listings; resolvable by direct ID with `validation: 'quarantined'`. |

### Q9. Schema changes

**Ruling.** None. The bead is filesystem walk + `hall_mounted_spokes` read only. This is load-bearing: it lets `BEAD-CSTAR-SPOKE-DISCOVERY-001` ship independently of `HALL_PER_SPOKE_TRAY.md`, which is still PROPOSED.

---

## 3. Architecture

### 3.1 New module — spoke capability walker

`src/node/core/spokes/spoke_capability_walker.ts` (new file):

```ts
export interface SpokeSkillManifest {
    id: string;                    // namespaced: `<slug>:<bare_id>`
    bare_id: string;
    spoke_slug: string;
    spoke_root: string;
    authority_path: string;        // <root>/.agents/skills/<bare>/SKILL.md
    name: string;
    description: string;
    tier: 'PRIME' | 'SKILL' | 'WEAVE' | 'SPELL' | 'UNKNOWN';
    risk: string;                  // 'low' | 'high-authority' | 'safety-critical' | 'unknown'
    frontmatter_raw: Record<string, unknown>;
    documentation: string;         // full SKILL.md body
    validation: 'ok' | 'invalid' | 'quarantined';
    validation_reason?: string;
    shadows_hub_id: boolean;
}

export function walkSpokeSkills(spokeSlug?: string): SpokeSkillManifest[];
export function walkSpokeJournal(spokeSlug: string): SpokeJournalReport;
```

The walker is a **pure function** of the filesystem + `hall_mounted_spokes`. No state, no caching in v1 (premature). It runs synchronously inside the MCP handler — the largest realistic spoke has a few dozen skills; FS walk is microseconds.

### 3.2 MCP tool registration

In `src/tools/cstar-kernel-mcp.ts`, three new tool definitions added next to the existing capability discovery tools. Each handler is a thin wrapper that calls into `spoke_capability_walker` + serialises the result. Tool definitions follow the existing pattern (zod schemas, JSON-only responses).

### 3.3 CLI extension

`cstar manifest` and `cstar skill-info` Commander definitions gain `--scope` and `--spoke` options. The merge order for `cstar manifest --scope=all`:

1. Kernel registry entries (existing path).
2. Spoke entries from `walkSpokeSkills()` for each active + trusted spoke.

Results are stable-sorted by `id` for deterministic operator output.

`cstar spoke journal <slug>` is a new subcommand under `cstar spoke` (alongside the planned `cstar spoke tray <slug>` from `HALL_PER_SPOKE_TRAY.md`).

### 3.4 Authority field semantics for spoke skills

Spoke skills get virtual entries in the manifest output with:

- `authority_path`: absolute path to the SKILL.md.
- `entrypoint_path`: `null` in v1 (no kernel-backed execution).
- `contract_path`: `<spoke_root>/tests/features/` if it exists, else `null`.
- `owner_runtime`: `'host-agent'` (always — announce-only).
- `execution_mode`: `'agent-native'`.
- `entry_surface`: `'host-only'` (operator must invoke from the host agent harness).
- `source`: `'spoke'` with `source_spoke: '<slug>'`.

---

## 4. MCP Response Shapes (v1)

### 4.1 `cstar_manifest({ scope: 'all' })` — relevant additions

```jsonc
{
  "capabilities": [
    /* … kernel entries (unchanged) … */
    {
      "id": "corvuseye:usb-forge-contract-verify",
      "bare_id": "usb-forge-contract-verify",
      "source": "spoke",
      "source_spoke": "corvuseye",
      "tier": "SKILL",
      "risk": "low",
      "entry_surface": "host-only",
      "execution_mode": "agent-native",
      "owner_runtime": "host-agent",
      "authority_path": "/home/morderith/Corvus/CorvusEye/.agents/skills/usb-forge-contract-verify/SKILL.md",
      "active_in_runtime": false,
      "validation": "ok"
    }
  ]
}
```

### 4.2 `cstar_skill_info({ id: 'corvuseye:usb-forge-contract-verify' })`

```jsonc
{
  "capability": { /* same record as above */ },
  "documentation": {
    "kind": "markdown",
    "path": "/home/morderith/Corvus/CorvusEye/.agents/skills/usb-forge-contract-verify/SKILL.md",
    "content": "---\nname: usb-forge-contract-verify\n…"
  },
  "invocation": {
    "agent_hint": "any-host-agent",
    "working_dir": "/home/morderith/Corvus/CorvusEye",
    "command": null,
    "logic_protocol_anchor": "## 🧭 LOGIC PROTOCOL"
  }
}
```

`command` is `null` because the skill is agent-native; the host reads `documentation.content`, jumps to `logic_protocol_anchor`, and executes the steps in its own session. This is the announce/execute split made concrete.

### 4.3 `cstar_spoke_journal({ spoke: 'corvuseye' })`

```jsonc
{
  "spoke": "corvuseye",
  "root_path": "/home/morderith/Corvus/CorvusEye",
  "files": {
    "memory_md":     { "present": true, "path": ".agent/memory.md",   "mtime": 1715520000, "sha256": "…", "size_bytes": 4096, "summary": "Active Investigation — USB Forge (2026-05-11)…" },
    "tasks_md":      { "present": true, "path": "tasks.md",            "mtime": 1715520100, "sha256": "…", "open_tasks": 1, "summary": "Active Tasks" },
    "wireframe_md":  { "present": true, "path": "wireframe.md",        "mtime": 1715520200, "sha256": "…", "prominent_functions": ["usb_forge::ForgeShot::build", "usb_forge::run_shot", "…"] },
    "dev_journal_md":{ "present": true, "path": "DEV_JOURNAL.md",      "mtime": 1715520300, "sha256": "…" }
  },
  "validation": "ok"
}
```

---

## 5. CStar Discipline (Sterling Mandate Triad)

- **Bead anchor**: `BEAD-CSTAR-SPOKE-DISCOVERY-001`, kernel-anchored.
- **Lore (leg 1)**: `tests/features/spoke_discovery.feature` covering:
  - Scenario: kernel walks an active spoke and surfaces its skills.
  - Scenario: quarantined spoke is excluded from `scope=all` but resolvable by ID.
  - Scenario: malformed SKILL.md surfaces with `validation: 'invalid'` not dropped.
  - Scenario: `cstar_spoke_journal` reports `{present: false}` for missing files.
  - Scenario: spoke root removed from disk reports `mount_status_drift`.
  - Scenario: `:`-bearing bare IDs rejected.
- **Isolation (leg 2)**: `tests/unit/spoke_discovery/` — one file per Q ruling. Fixture: a temp directory acting as a synthetic spoke with deliberate variants (clean, missing-file, invalid-frontmatter, quarantined-marker).
- **Integration (leg 3)**: `tests/integration/spoke_discovery_against_corvuseye.test.ts` — calls `walkSpokeSkills('corvuseye')` against the actual repo, asserts `corvuseye:usb-forge-contract-verify` surfaces with `validation: 'ok'`. Uses the real `hall_mounted_spokes` row.
- **Audit (leg 4)**: Gungnir on the integration PR. Wardens: Norn (lore coverage on every Q), Ghost (no new privileged surface — read-only, filesystem-bounded), Heimdall (no warden firings on first-walk), Valkyrie (no dead code branches in the walker).

---

## 6. Acceptance Criteria

The bead resolves when:

1. **Lore exists** — `tests/features/spoke_discovery.feature` covers Q1–Q8.
2. **Isolation passes** — `npm run test:node -- tests/unit/spoke_discovery/` green.
3. **Integration passes** — `walkSpokeSkills('corvuseye')` returns ≥1 row including `corvuseye:usb-forge-contract-verify` with `validation: 'ok'`. `cstar_spoke_journal({ spoke: 'corvuseye' })` reports all four files present.
4. **MCP wired** — `cstar_manifest`, `cstar_skill_info`, `cstar_spoke_journal` registered in `src/tools/cstar-kernel-mcp.ts` and roundtrip via the MCP test harness.
5. **CLI wired** — `./cstar manifest --scope=all --json` includes spoke entries; `./cstar spoke journal corvuseye --json` returns the journal payload.
6. **Audit recorded** — Gungnir score on the integration PR; wardens listed in §5 green.
7. **No regression** — existing `npm test` passes with 0 new failures. `cstar manifest` (no flags) byte-identical to current behavior (default `scope=hub`).

---

## 7. Slicing (proposed — to be ratified)

| Slice | Scope | Lands |
|---|---|---|
| **F1** | `spoke_capability_walker.ts` — `walkSpokeSkills` only, with unit fixtures. Synchronous, no MCP wiring yet. | Walker + tests for Q1, Q2, Q5, Q8. |
| **F2** | `walkSpokeJournal` + Q7 payload + tests. Still no MCP wiring. | Journal walker + tests. |
| **F3** | MCP wiring for all three tools in `cstar-kernel-mcp.ts`. | MCP roundtrip; integration test against CorvusEye. |
| **F4** | CLI extension (`cstar manifest --scope/--spoke`, `cstar spoke journal`). | Operator-facing surface; Commander-derived `invoke` metadata in manifest. |
| **F5** | Lore feature file + Sterling triad close. | Bead resolution. |

F1 and F2 are independent and can run in parallel if a second agent picks one up. F3 blocks on both. F4 blocks on F3. F5 closes.

---

## 8. Open Items (do not block)

- **OI-1.** Weave discovery (`cstar_manifest` scope including `.agents/weaves/`) is the natural follow-up. Deferred to v1.1.
- **OI-2.** Spell discovery — same pattern, but spells are policy-only by default and need explicit `runtime-backed` filter UX. Deferred.
- **OI-3.** Per-spoke `.agents/skill_registry.json` overlay parsing — Q1 allows for it, but no spoke ships one today. Deferred until the first spoke registry appears.
- **OI-4.** Cache layer for spoke walks (LRU by `mtime` of `<root>/.agents/skills/`). Premature for v1; FS walk is fast enough.
- **OI-5.** Cross-spoke contract registry (S4 from the original slicing) — when the three-Engram USB Forge ↔ Sentry protocol gets a first-class kernel record. Separate bead.
- **OI-6.** Trust-aware invocation (S5 — `cstar_skill_invoke` records an audit Engram). Separate bead, depends on this one.

---

## 9. Non-goals

- The kernel does **not** spawn processes for spoke skills in v1.
- The kernel does **not** maintain a write-through cache of spoke registry files.
- The kernel does **not** modify any spoke filesystem from this surface (read-only).
- The kernel does **not** depend on `HALL_PER_SPOKE_TRAY.md` shipping first.

---

## 10. Cross-references

- Reference spoke skill (fixture for F3 integration test): `CorvusEye/.agents/skills/usb-forge-contract-verify/SKILL.md`.
- Existing CLI discovery contract this extends: `docs/integrations/cstar_capability_discovery_api.md`.
- Universal Skill Registry authority manifest: `docs/architecture/SKILL_REGISTRY.md`.
- Supreme Directive (justifies announce-only): `AGENTS.qmd` §0.
- Spoke anchoring (write-side trust gate this read surface complements): `src/tools/cstar-kernel-mcp.ts::resolveSpokeAnchor`.
