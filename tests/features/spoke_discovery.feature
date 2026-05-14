Feature: Spoke Discovery — Kernel Announces Spoke-Local Capabilities
  As the CStar kernel, the routing and memory layer of the One Mind
  I want to enumerate spoke-local SKILL.md manifests and the four-file journal state
  Without spawning the spoke's code or trusting any side-channel
  So that any host agent operating in any spoke can discover capabilities
  Through a single MCP/CLI surface, while spokes evolve their skills independently.

  # Anchored to BEAD-CSTAR-SPOKE-DISCOVERY-001.
  # Design record: docs/beads/cstar-spoke-discovery-001.md
  # The walker is read-only; the kernel never mutates a spoke filesystem and
  # never executes a spoke skill — the host agent runs the announced skill per
  # Host-Native First (AGENTS.qmd §0).

  Background:
    Given the Hall has at least one active, non-quarantined mounted spoke
    And that spoke has a directory at "<root>/.agents/skills/<bare_id>/SKILL.md"
    And the SKILL.md has YAML frontmatter with at minimum `name`, `description`, `tier`

  # ─── Q1: Manifest location — kernel walks <spoke>/.agents/skills ──────

  Scenario: Walker reads SKILL.md under the spoke's .agents/skills tree
    Given a spoke "alpha" with a skill directory "<root>/.agents/skills/clean-skill/SKILL.md"
    When walkSpokeSkillsForRecords is invoked with the alpha spoke record
    Then the result contains one entry with bare_id "clean-skill"
    And the entry's authority_path points at the on-disk SKILL.md
    And the entry's validation is "ok"

  Scenario: A skill directory without SKILL.md is silently skipped
    Given a spoke with both "ghost-skill/" (empty) and "real-skill/SKILL.md"
    When the walker runs
    Then only "real-skill" surfaces

  Scenario: Underscore-prefixed directories are archive convention and are skipped
    Given a spoke with "_archive/SKILL.md" and "live-skill/SKILL.md"
    When the walker runs
    Then only "live-skill" surfaces

  # ─── Q2: Namespace strategy — <slug>:<bare_id> with strict bare validation ─

  Scenario: Spoke skill IDs are namespaced as <slug>:<bare_id>
    Given a spoke "corvuseye" with skill "forge-contract-verify"
    When the walker emits a manifest
    Then the id is "corvuseye:forge-contract-verify"
    And the bare_id is "forge-contract-verify"

  Scenario: Bare id containing a colon is invalid
    When validateBareId is called with "has:colon"
    Then the result is { ok: false } with reason mentioning "colon"

  Scenario: Spoke skill shadowing a hub registry id flags shadows_hub_id
    Given the hub registry contains capability id "gungnir"
    And a spoke has a skill with bare_id "gungnir"
    When the walker runs with hubRegistryIds containing "gungnir"
    Then the spoke entry has shadows_hub_id = true

  # ─── Q3: Announce-only — kernel returns SKILL.md, host executes ───────

  Scenario: Skill-info on a spoke skill returns the documentation and invocation contract
    Given a registered spoke "corvuseye" with skill "forge-contract-verify" validation=ok
    When cstar_skill_info is called with id "corvuseye:forge-contract-verify"
    Then the response includes documentation.content equal to the SKILL.md bytes
    And invocation.working_dir equals the spoke's root_path
    And invocation.command is null
    And invocation.agent_hint is "any-host-agent"

  # ─── Q4: MCP surface — three additive tools ──────────────────────────

  Scenario: cstar_manifest with scope=hub returns only hub entries
    When cstar_manifest is called with { scope: "hub" }
    Then every capability has source = "hub"

  Scenario: cstar_manifest with scope=spoke returns only spoke-local entries
    When cstar_manifest is called with { scope: "spoke" }
    Then every capability has source = "spoke"
    And every capability id matches the pattern "<slug>:<bare>"

  Scenario: cstar_manifest with scope=all merges hub and spoke entries, stable-sorted by id
    When cstar_manifest is called with { scope: "all" }
    Then the response contains capabilities from both sources
    And the capabilities are stable-sorted by id

  # ─── Q5: Spoke locator — hall_mounted_spokes with active+non-quarantined ─

  Scenario: Inactive spokes are excluded entirely
    Given a spoke with mount_status = "inactive"
    When the walker runs
    Then that spoke contributes no entries

  Scenario: Quarantined spokes are excluded from scope=spoke and scope=all listings
    Given a spoke with trust_level = "quarantined"
    When the walker runs without includeQuarantined
    Then that spoke contributes no entries

  Scenario: Quarantined spokes are resolvable by explicit cstar_skill_info call
    Given a spoke "rogue" is quarantined and has a skill "do-not-use"
    When cstar_skill_info is called with id "rogue:do-not-use"
    Then the response is returned with capability.validation = "quarantined"

  # ─── Q6: Trust enforcement — read is unrestricted; no write_policy gate ──

  Scenario: A read_only spoke's skills are still announced
    Given a spoke with write_policy = "read_only" but mount_status = "active" and trust_level = "trusted"
    When the walker runs
    Then the spoke's skills surface normally
    And no Hall write is attempted by the walker

  # ─── Q7: Journal awareness — four files with summaries ────────────────

  Scenario: All four journal files present
    Given a spoke with `.agent/memory.md`, `tasks.md`, `wireframe.md`, `DEV_JOURNAL.md` on disk
    When cstar_spoke_journal is called
    Then each of the four files reports present=true with mtime, sha256, size_bytes, summary
    And the top-level validation is "ok"

  Scenario: Memory file read from .agent/ (singular) when only that exists
    Given a spoke with `.agent/memory.md` but no `.agents/memory.md`
    When the journal is walked
    Then files.memory_md.path is ".agent/memory.md"
    And files.memory_md.validation is "ok"

  Scenario: Memory file read from .agents/ (plural) when only that exists
    Given a spoke with `.agents/memory.md` but no `.agent/memory.md`
    When the journal is walked
    Then files.memory_md.path is ".agents/memory.md"
    And files.memory_md.validation is "ok"

  Scenario: Memory drift flagged when both .agent/ and .agents/ exist
    Given a spoke with both `.agent/memory.md` and `.agents/memory.md`
    When the journal is walked
    Then files.memory_md.validation is "drift"
    And files.memory_md.drift_paths lists both candidate paths

  Scenario: tasks.md exposes open_tasks count
    Given a tasks.md with three "- [ ]" lines and one "- [x]" line
    When the journal is walked
    Then files.tasks_md.open_tasks equals 3

  Scenario: wireframe.md exposes prominent_functions from a "Prominent Functions" section
    Given a wireframe.md with a "## Prominent Functions" section listing backticked function signatures
    When the journal is walked
    Then files.wireframe_md.prominent_functions contains each signature
    And signatures outside the section are not included

  Scenario: DEV_JOURNAL.md last_entry_timestamp returns the lexicographically max ISO 8601 date
    Given a DEV_JOURNAL.md mentioning dates "2026-05-11", "2026-05-13", "2026-05-12"
    When the journal is walked
    Then files.dev_journal_md.last_entry_timestamp is "2026-05-13"

  # ─── Q8: Failure modes — report, never drop silently, never mutate ────

  Scenario: Malformed SKILL.md frontmatter surfaces with validation=invalid
    Given a SKILL.md whose frontmatter has a line missing a colon
    When the walker runs
    Then the skill is included with validation = "invalid"
    And the documentation field still contains the raw SKILL.md bytes

  Scenario: SKILL.md with no frontmatter block surfaces with validation=invalid
    Given a SKILL.md whose body has no `---` frontmatter
    When the walker runs
    Then the skill is included with validation = "invalid" and a reason mentioning frontmatter

  Scenario: SKILL.md missing required field (name or description) surfaces with validation=invalid
    Given a SKILL.md whose frontmatter has tier and risk but no description
    When the walker runs
    Then the skill is included with validation = "invalid" and a reason mentioning the missing field

  Scenario: SKILL.md with an unknown tier surfaces with tier=UNKNOWN and validation=invalid
    Given a SKILL.md whose frontmatter sets tier to "PHANTOM"
    When the walker runs
    Then the skill is included with tier = "UNKNOWN" and validation = "invalid"

  Scenario: Spoke root no longer exists on disk reports mount_status_drift
    Given the hall_mounted_spokes row for "ghost" points at a path that does not exist
    When walkSpokeJournalForRecord is called
    Then the top-level validation is "mount_status_drift"
    And every file reports present = false

  Scenario: The walker never writes to a spoke filesystem
    Given any combination of valid and invalid SKILL.md files
    When the walker runs
    Then no file under any spoke root is created, modified, or deleted

  # ─── Q9: No schema changes — read-only over existing hall_mounted_spokes ─

  Scenario: No new tables are required for v1
    When the bead lands
    Then the Hall schema is byte-identical to the pre-bead state
    And `cstar manifest --json` (no flags) returns a payload byte-identical to the pre-bead path

  # ─── Sterling Mandate gate — the bead closes when ─────────────────────

  Scenario: BEAD-CSTAR-SPOKE-DISCOVERY-001 resolves
    Given tests/features/spoke_discovery.feature is green (Lore)
    And tests/unit/spoke_discovery/*.test.ts is green (Isolation)
    And tests/integration/spoke_discovery_against_corvuseye.test.ts is green (Integration)
    And Gungnir score on the integration PR is recorded (Audit)
    And ./cstar manifest --scope=all --json includes corvuseye:forge-contract-verify (Hall closes)
    Then the bead transitions from IN_PROGRESS to RESOLVED
