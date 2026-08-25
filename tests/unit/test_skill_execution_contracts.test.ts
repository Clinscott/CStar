import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve('.');
const inactiveMm = 'MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role';
const privateManifestKeys = [
    'allow_arbitrary_source_root', 'bootstrap_mode', 'credential_profile',
    'credential_profile_owner', 'dependency_mode', 'launcher', 'model',
    'network_entrypoint', 'oauth_read_only', 'oauth_refresh_allowed',
    'oauth_store_write_allowed', 'provider', 'runtime_owner', 'schema',
    'source_files',
].sort();

function read(relativePath: string): string {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath: string): Record<string, any> {
    return JSON.parse(read(relativePath)) as Record<string, any>;
}

function flat(value: string): string {
    return value.replace(/\s+/g, ' ');
}

describe('current host-only skill execution contracts', () => {
    it('binds registry metadata, native flat dispatch, and historical compatibility boundaries', () => {
        const registry = readJson('.agents/skill_registry.json');
        const forge = registry.entries['corvus-forge'];
        const researcher = registry.entries.researcher;
        assert.equal(forge.entry_surface, 'host-only');
        assert.equal(forge.owner_runtime, 'host-agent');
        assert.equal(forge.execution.mode, 'agent-native');
        assert.equal(forge.execution.ownership_model, 'host-workflow');
        assert.deepEqual(forge.tests, [
            'tests/unit/corvus-forge/test_native_swarm_packet.test.mjs',
            'tests/unit/corvus-forge/test_native_swarm_receipt.test.mjs',
            'tests/unit/test_skill_execution_contracts.test.ts',
        ]);
        assert.equal(researcher.entry_surface, 'host-only');
        assert.equal(researcher.owner_runtime, 'host-agent');
        assert.equal(researcher.execution.mode, 'agent-native');
        assert.equal(researcher.execution.ownership_model, 'host-workflow');

        const forgeSkill = read('.agents/skills/corvus-forge/SKILL.md');
        const flatForgeSkill = flat(forgeSkill);
        assert.match(flatForgeSkill, /cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> cstar_forge_swarm_plan -> direct host-native workers -> cstar_forge_swarm_update -> separate read-only aggregator -> cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED -> independent cstar_record_result -> CoS closeout/);
        assert.equal(forge.execution.connection_id, 'forge-native-codex-swarm-v1');
        assert.match(flatForgeSkill, /one to three useful direct workers with disjoint ownership/);
        assert.match(flatForgeSkill, /Workers have no nested Forge parent, descendants, peer authority transfer, retry, replay, replacement, or selector fallback/);
        assert.match(flatForgeSkill, /requested selector and reasoning are immutable packet inputs/);
        assert.match(flatForgeSkill, /Record requested and actual identity separately/);
        assert.match(flatForgeSkill, /actual identity is `unreported`/);
        assert.match(flatForgeSkill, /Historical Codex-host state-only handoff and private Hermes\/MiniMax material is tombstone or explicitly selected legacy evidence only/);
        assert.match(flatForgeSkill, /never the current, default, target, replacement, recovery, or fallback Forge path/);

        const researcherSkill = read('.agents/skills/researcher/SKILL.md');
        assert.match(researcherSkill, /entry_surface: host-only/);
        assert.match(researcherSkill, /`cstar_researcher_request` remains a receipt\s+surface/);
        assert.match(researcherSkill, /legacy v2 Forge compatibility, not a default Researcher\s+route/);
        assert.match(flat(researcherSkill), new RegExp(inactiveMm));

        const provenance = read('.agents/skills/corvus-forge/runtime/PROVENANCE.md');
        assert.match(provenance, /legacy v2 Forge compatibility/);
        assert.match(provenance, /not current v3 routing/);
        assert.match(provenance, /not the default Researcher route/);
        assert.doesNotMatch(provenance, /current supported Hermes M3 transport/);

        const manifest = readJson('.agents/skills/corvus-forge/runtime/manifest.json');
        assert.deepEqual(Object.keys(manifest).sort(), privateManifestKeys);
        assert.equal(manifest.schema, 'cstar.forge_private_runtime_manifest.v2');
        assert.equal(manifest.provider, 'minimax-oauth');
        assert.equal(manifest.model, 'MiniMax-M3');
        assert.equal(manifest.compatibility_only, undefined);

        assert.match(flat(read('docs/operations/corvus-forge-pipeline-playbook.md')), new RegExp(inactiveMm));
        assert.match(read('docs/plans/cstar-hub-completion-summary.md'), /NON-AUTHORITATIVE FOR CURRENT ROUTING/);
    });
});
