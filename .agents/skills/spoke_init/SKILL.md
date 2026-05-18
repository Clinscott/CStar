---
name: spoke_init
description: Project a newly-mounted spoke into a true CStar member — generates SPOKE_PROFILE.md + machine-readable index, indexes the capability surface, and seeds the Hermes knowledge map. Auto-fires on `cstar spoke link`; can be re-run on demand.
tier: SKILL
risk: low
intent_category: EXPAND
entry_surface: cli
terminal_required: false
---

# 🌱 SKILL: SPOKE_INIT (v1.0)

## 💎 WHEN TO USE
- A new spoke has just been linked (`cstar spoke link <slug> <root>` or `cstar_spoke action=link`) and you need to confirm the projection landed.
- An existing spoke has changed materially (new skills, new docs, new build commands, contributor turnover) and the cached profile is stale.
- A Hermes-style knowledge researcher needs an entry index for a spoke and `<spoke>/.cstar/spoke_profile.json` is missing or out of date.

## 🛠️ EXECUTION MODE
**Hybrid**: a deterministic kernel projector runs synchronously on link; an optional host-native deepening pass refines the narrative sections.

The deterministic projector is the source of truth — it ALWAYS runs unless `--no-init` (CLI) or `skip_init=true` (MCP) is passed. The host pass is opt-in.

## 🧩 LOGIC PROTOCOL

### Phase 1 — Deterministic projection + authority (kernel-side, no LLM)
Implemented in `src/node/core/spokes/spoke_projector.ts` (observation) and `src/node/core/spokes/spoke_authority.ts` (contract). Both run synchronously, in order, on every link / project call, and are wired into:
- `cstar spoke link` (CLI; `src/node/core/commands/spoke.ts`)
- `cstar_spoke action=link` (MCP)
- `cstar_spoke action=project` (MCP — re-project an already-registered spoke)

What it produces in `<spoke>/.cstar/`:
1. **`SPOKE_PROFILE.md`** — human-readable observation profile (mirrors how `/init` writes CLAUDE.md). Stack, build surface, capabilities, knowledge map, git, Hermes integration.
2. **`spoke_profile.json`** — machine-readable observation index for cross-spoke search and knowledge-research entry.
3. **`IDENTITY.json`** — proof-of-mount identity card. Slug, hub repo_id, hub root, mount_token (UUID nonce), registered_at, last_renewed_at, contract_version, trust_level, write_policy.
4. **`CSTAR_CONTRACT.md`** — authority document. Rules CStar imposes (Sterling Mandate, Augury, capability namespacing, bead protocol, identity stewardship, quarantine respect) AND rights CStar grants (Hall persistence, capability discovery, Engram seeding, intent routing, profile durability, Hermes integration).
5. **`CAPABILITIES.md`** — declared `<slug>:<bare_id>` namespace charter. Tabular enumeration of every skill / workflow / script / make_target / just_recipe with stability tier notes.
6. **`INTAKE.md`** — bead/engram intake contract. Content varies by `trust_level` × `write_policy`: QUARANTINED hard reject, READ-ONLY no submissions, READ-WRITE full intake rules with target_kind whitelist, source_kind convention, Sterling Mandate enforcement, hard kernel gates.
7. **`HUB_ACK.json`** — CStar's signed acknowledgement. Contains mount_token, hub kernel version, accepted_at, sha256 over each of the 4 contract files. Functions as proof that the hub admitted this spoke under the documented contract.

Hall-side back-references on every projection:
- `hall_mounted_spokes.projection_status` → `current`
- `hall_mounted_spokes.last_scan_at` → projection timestamp
- `hall_mounted_spokes.metadata.projection` → observation patch (stack, counts, git, hermes, profile sha256s)
- `hall_mounted_spokes.metadata.authority` → contract patch (mount_token, contract_version, paths, sha256s, rotated flag)

**Mount token preservation order** (priority high→low):
1. Existing `<spoke>/.cstar/IDENTITY.json` on disk.
2. `hall_mounted_spokes.metadata.authority.mount_token` (Hall back-reference).
3. Newly-generated UUIDv4 (logged with `rotated=true`).

This means re-linking a spoke is idempotent with respect to identity: the same token is preserved unless the spoke is genuinely fresh OR `rotateToken=true` is explicitly passed. A token mismatch between IDENTITY.json and Hall is the canonical proof-of-mount drift signal.

What it captures:
- **Stack signals**: package.json (node/bun), Cargo.toml (rust), pyproject.toml (python), go.mod (go), deno.json (deno).
- **Build surface**: package.json scripts, Makefile targets, justfile recipes, package manager (npm/pnpm/yarn/bun/cargo/poetry/pip/go).
- **Capability inventory**: `.agents/skills/<name>/SKILL.md` walked for frontmatter; `.agents/workflows/*.md`; package.json scripts; Make targets; just recipes — all surfaced as namespaced `<slug>:<bare_id>` capabilities.
- **Knowledge map**: top-level + `docs/` + `.agents/` markdown (.md/.mdx/.qmd/.rst/.txt) up to 30 entries, categorized as readme/agents/architecture/docs/changelog/license/other, each with a 240-char summary.
- **Git snapshot**: HEAD, branch, remote URL, last 10 commits, top contributors.
- **Hermes research profile** (observe-only): detects `~/.hermes/profiles/<slug>/`. When present, parses `config.yaml` (model, daily_brief_time, refresh_interval_hours, artifact_pattern, output_dir) and `workspace/research-vault/context/interest-profile.json` (lanes, current_priorities, key_questions). Surfaces today's expected digest path + the last 7 days of digests with first-line summaries. When absent, emits a `next_step` instructing the operator to run `hermes profile init <slug>`.

### Phase 2 — Host-native deepening (optional, host LLM)
When the host wants to enhance the deterministic baseline (e.g., add narrative architecture summary, decision log digest, cross-spoke relationship map), run this skill explicitly:

1. Read `<spoke>/.cstar/spoke_profile.json` to get the structured projection.
2. Read the high-signal docs from `knowledge_index` (categories `readme`, `architecture`, `agents` first).
3. Walk the spoke's `src/` (or equivalent) — sample 5-10 representative entrypoints derived from the build scripts.
4. Append a new section **`## Host Augmentation`** to `<spoke>/.cstar/SPOKE_PROFILE.md` with:
   - Architecture narrative (2-3 paragraphs).
   - Cross-spoke relationships (which other estate spokes does this one talk to / depend on).
   - Open questions / decision points worth flagging to operators.
5. Re-run `cstar_spoke action=project slug=<slug>` afterwards if you want the deterministic baseline regenerated under the augmented file (the projector overwrites both files — host augmentation should live in a separate `<spoke>/.cstar/HOST_AUGMENTATION.md` to survive re-projection). **Default to writing host narrative into `HOST_AUGMENTATION.md` so the deterministic file stays a reproducible artifact.**

## 🔒 INVARIANTS
- The projector NEVER touches anything outside `<spoke>/.cstar/`.
- The projector NEVER spawns an LLM. All Phase 1 work is deterministic and bounded (~5s wall-clock for a typical spoke).
- The deterministic profile is overwritable and reproducible. Anyone running `cstar_spoke action=project slug=<slug>` should get the same artifact (modulo timestamps and git state).
- Host augmentation lives in a separate file (`<spoke>/.cstar/HOST_AUGMENTATION.md`) so it is not destroyed by re-projection.
- A failed projection does NOT block the link — the spoke registers with `projection_status='missing'` and `metadata.projection_error` records the failure.

## 📐 RISK & REVIEW
- **risk: low** — bounded filesystem read + two small file writes inside the spoke's own `.cstar/` directory.
- The projector respects standard exclusions (`node_modules`, `.venv`, `dist`, `build`, `target`).
- Knowledge map caps at 30 docs / 64 KB per file to bound runtime and memory.
- Git introspection has a 5s timeout per command.

## 🔗 CONTRACT
- **MCP entry**: `cstar_spoke action=link` (auto), `cstar_spoke action=project` (manual re-run).
- **CLI entry**: `./cstar spoke link <slug> <root>` (auto; `--no-init` to skip).
- **Implementation**: `src/node/core/spokes/spoke_projector.ts` (`projectSpoke` function).
- **Hall write**: `hall_mounted_spokes.metadata.projection` + `projection_status` + `last_scan_at`.
- **Outputs in spoke**: `<spoke>/.cstar/SPOKE_PROFILE.md`, `<spoke>/.cstar/spoke_profile.json`.
