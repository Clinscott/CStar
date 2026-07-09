import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-primer-gpt-5-6-sol.md');
const SCHEMA_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-schema.v1.json');
const PACKET_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-new-thread-packet.md');
const FEATURE_PATH = path.join(ROOT, 'tests/features/cos_context_refresh_primer.feature');

function read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

describe('CoS context refresh primer', () => {
    it('keeps the machine-readable schema valid and bounded', () => {
        const schema = JSON.parse(read(SCHEMA_PATH));

        assert.strictEqual(schema.properties.schema_version.const, 'cos.context_refresh.v1');
        assert(schema.required.includes('control_plane'));
        assert(schema.required.includes('pennyone'));
        assert(schema.required.includes('bootstrap_prompt'));
        assert(schema.properties.token_policy.properties.bootstrap_target_tokens.maximum <= 4000);
    });

    it('documents the required handoff controls for a fresh CoS thread', () => {
        const doc = read(DOC_PATH);

        for (const required of [
            'CStar is the axle',
            'PMTs are durable project memory',
            'Corvus Forge builds implementation',
            'Researcher researches',
            'PennyOne/dashboard mirrors state',
            'Cycle Breaker',
            'perfect_score_review_pending',
            'Zero denominators, empty arrays, skipped rows, or missing fixtures',
            'Gemini 3.1 Pro (High)',
            'GPT-5.6 Sol',
            'Single Bootstrap Prompt',
        ]) {
            assert.match(doc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });

    it('forbids high-token evidence replay in the bootstrap contract', () => {
        const doc = read(DOC_PATH);

        for (const forbidden of [
            'raw model responses',
            'raw transcripts',
            'full logs',
            'full manifests',
            'full SHA lists',
            'broad old chat replay',
        ]) {
            assert.match(doc, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });

    it('provides a single pasteable packet path for new CoS threads', () => {
        const packet = read(PACKET_PATH);

        assert.match(packet, /Read this local handoff packet before acting/);
        assert.match(packet, /\/home\/morderith\/Corvus\/CStar\/docs\/operations\/cos-context-refresh-new-thread-packet\.md/);
        assert.match(packet, /bead:exec:cos-refresh-primer-schema-2026-07-09/);
        assert.match(packet, /val-1783599069890-c0mz3/);
        assert.match(packet, /cstar_doctor/);
        assert.match(packet, /perfect_score_review_pending/);
    });

    it('keeps a Sterling lore contract for the primer behavior', () => {
        const feature = read(FEATURE_PATH);

        assert.match(feature, /Fresh CoS context is restored from durable state/);
        assert.match(feature, /perfect scores as review-pending/);
        assert.match(feature, /forbid raw transcript or log replay/);
    });
});
