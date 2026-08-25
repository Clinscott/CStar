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
    it('binds registry metadata, lifecycle, state-only v3, and legacy v2 boundaries', () => {
        const registry = readJson('.agents/skill_registry.json');
        const forge = registry.entries['corvus-forge'];
        const researcher = registry.entries.researcher;
        assert.equal(forge.entry_surface, 'host-only');
        assert.equal(forge.owner_runtime, 'host-agent');
        assert.equal(forge.execution.mode, 'agent-native');
        assert.equal(forge.execution.ownership_model, 'host-workflow');
        assert.deepEqual(forge.tests, ['tests/unit/test_skill_execution_contracts.test.ts']);
        assert.equal(researcher.entry_surface, 'host-only');
        assert.equal(researcher.owner_runtime, 'host-agent');
        assert.equal(researcher.execution.mode, 'agent-native');
        assert.equal(researcher.execution.ownership_model, 'host-workflow');

        const forgeSkill = read('.agents/skills/corvus-forge/SKILL.md');
        assert.match(forgeSkill, /cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> Codex-host state-only handoff -> DELIVERED_PENDING_VALIDATION -> independent cstar_record_result -> CoS closeout/);
        assert.match(forgeSkill, /host_launch_required: true/);
        assert.match(forgeSkill, /performs no provider, cognition, or CStar\s+launch at handoff/);
        assert.match(forgeSkill, /requested selector and host-attested actual identity separately/);
        assert.match(forgeSkill, /unreported.*null/);
        assert.match(forgeSkill, /Private Hermes `cstar-hub` \/ MiniMax-M3 is an explicitly\s+selected legacy v2 compatibility lane, not the current default route/);

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
