import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve('.');
const inactiveMm = 'MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role';
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
    it('binds registry metadata, native topology, identity separation, and retirement boundaries', () => {
        const registry = readJson('.agents/skill_registry.json');
        const forge = registry.entries['corvus-forge'];
        const researcher = registry.entries.researcher;
        assert.equal(forge.entry_surface, 'host-only');
        assert.equal(forge.owner_runtime, 'host-agent');
        assert.equal(forge.execution.mode, 'agent-native');
        assert.equal(forge.execution.ownership_model, 'host-workflow');
        assert.deepEqual(forge.tests, [
            'tests/unit/test_skill_execution_contracts.test.ts',
            'tests/unit/cstar-kernel-mcp/test_forge_native_swarm_contract.test.ts',
        ]);
        assert.equal(researcher.entry_surface, 'host-only');
        assert.equal(researcher.owner_runtime, 'host-agent');
        assert.equal(researcher.execution.mode, 'agent-native');
        assert.equal(researcher.execution.ownership_model, 'host-workflow');

        const forgeSkill = read('.agents/skills/corvus-forge/SKILL.md');
        assert.match(forgeSkill, /cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> native parent -> DELIVERED_UNVERIFIED -> independent cstar_record_result/);
        assert.match(forgeSkill, /durable_SET_scope ∩ immutable_request_scope ∩ active_connection_policy ∩ run_lease_scope/);
        assert.match(forgeSkill, /zero to three useful leaves/);
        assert.match(forgeSkill, /cannot create descendants/);
        assert.match(forgeSkill, /Do not substitute Hermes, MiniMax, AutoBot, `codex exec`/);
        assert.match(flat(forgeSkill), /requested selector \(`gpt-5\.6-luna`\/`max`\).*actual identity/);
        assert.match(forgeSkill, /Use `unreported` when the host supplies no attestation/);

        const researcherSkill = read('.agents/skills/researcher/SKILL.md');
        assert.match(researcherSkill, /entry_surface: host-only/);
        assert.match(researcherSkill, /`cstar_researcher_request` remains a receipt\s+surface/);
        assert.match(researcherSkill, /legacy v2 Forge compatibility, not a default Researcher\s+route/);
        assert.match(flat(researcherSkill), new RegExp(inactiveMm));

        const provenance = read('.agents/skills/corvus-forge/runtime/PROVENANCE.md');
        assert.match(provenance, /native Forge parent/);
        assert.match(flat(provenance), /actual identity is `unreported`/);
        assert.doesNotMatch(provenance, /Hermes|MiniMax|AutoBot|provider fallback/);

        const manifest = readJson('.agents/skills/corvus-forge/runtime/host-manifest.json');
        assert.equal(manifest.schema, 'cstar.forge_native_host_manifest.v1');
        assert.equal(manifest.connection_id, 'forge-native-codex-swarm-v1');
        assert.equal(manifest.requested_model, 'gpt-5.6-luna');
        assert.equal(manifest.requested_reasoning, 'max');
        assert.equal(manifest.actual_identity, 'unreported');
        assert.equal(manifest.actual_identity_attested, false);
        assert.equal(manifest.parent_limit, 1);
        assert.equal(manifest.leaf_limit, 3);
        assert.equal(manifest.descendant_limit, 0);

        assert.match(flat(read('docs/operations/corvus-forge-pipeline-playbook.md')), /forge-native-codex-swarm-v1/);
        assert.match(read('docs/integrations/cstar-kernel-mcp.md'), /DELIVERED_UNVERIFIED/);
        assert.match(read('docs/plans/cstar-hub-completion-summary.md'), /NON-AUTHORITATIVE FOR CURRENT ROUTING/);
    });
});
