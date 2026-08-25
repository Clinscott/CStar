import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();
const DOC_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-primer-gpt-5-6-sol.md');
const SCHEMA_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-schema.v1.json');
const PACKET_PATH = path.join(ROOT, 'docs/operations/cos-context-refresh-new-thread-packet.md');
const FEATURE_PATH = path.join(ROOT, 'tests/features/cos_context_refresh_primer.feature');

function read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

type RefreshMode = 'bootstrap' | 'refresh_delta' | 'live_run_delta' | 'closeout' | 'degraded_boot';
type Packet = Record<string, any>;

function packetFixture(mode: RefreshMode): Packet {
    const packet: Packet = {
        schema_version: 'cos.context_refresh.v1',
        refresh_id: `refresh-${mode}-2026-07-11`,
        generated_at: '2026-07-11T23:00:00Z',
        mode,
        model_target: {
            name: 'active-codex-model',
            expected_capabilities: ['agentic coding'],
            risk_posture: ['verify completion claims'],
        },
        authority: {
            canonical_plane: 'CStar kernel MCP and bead lifecycle',
            operator_gates: ['merge requires operator authority'],
            prohibited_shortcuts: ['no direct Hall writes'],
        },
        control_plane: {
            doctor_status: mode === 'degraded_boot' ? 'degraded' : 'healthy',
            handoff_status: 'current-targets-verified',
            active_bead: {
                bead_id: 'bead:example:cos-refresh',
                status: 'IN_PROGRESS',
                owner: 'codex',
                next_gate: 'focused validation',
            },
            state_checksum: 'a'.repeat(64),
            degraded_fallback: {
                enabled: mode === 'degraded_boot',
                source_order: ['CStar', 'PennyOne', 'artifact refs'],
                operator_escalation_after_failures: 3,
            },
        },
        active_work: {
            phase: 'bootstrap',
            gate: mode === 'degraded_boot' ? 'blocked' : 'green',
            next_action: 'verify current state',
            target_paths: ['docs/operations/cos-context-refresh-new-thread-packet.md'],
            checker_shells: ['node scripts/run-tsx.mjs --test tests/unit/test_cos_context_refresh_primer.test.ts'],
        },
        project_state: [],
        pmt_board: {
            active_threads: [],
            pinned_pmts: [],
            conflicts: [],
        },
        researcher: {
            role: 'research',
            authorized_lanes: [],
            blocked_lanes: ['live collection without authority'],
            current_constraints: ['no self-certification'],
        },
        forge: {
            role: 'implementation',
            authorized_lanes: [],
            blocked_lanes: ['live dispatch without authority'],
            current_constraints: ['bead-backed requests only'],
        },
        corvuseye: {
            role: 'evaluation',
            authorized_lanes: ['read-only review'],
            blocked_lanes: [],
            current_constraints: ['independent evaluation'],
        },
        pennyone: {
            status: 'healthy',
            dashboard_refs: ['pennyone:status'],
            last_updated_at: '2026-07-11T23:00:00Z',
            staleness_delta_seconds: 0,
        },
        live_runs: [],
        artifact_index: [{
            kind: 'document',
            path_or_uri: 'docs/operations/cos-context-refresh-new-thread-packet.md',
            sha256: 'b'.repeat(64),
            summary: 'Static bootstrap pointer',
            load_policy: 'cite_only',
        }],
        verification: {
            before_action: ['verify route'],
            before_success_claim: ['verify bead state'],
            perfect_score_policy: ['require a nonzero denominator'],
            cycle_breaker: {
                max_retries: 3,
                escalation: 'emit degraded_boot',
            },
        },
        token_policy: {
            bootstrap_target_tokens: 4000,
            refresh_target_tokens: 1500,
            live_delta_target_tokens: 800,
            forbidden_inline_sources: ['raw transcripts'],
        },
    };

    if (mode === 'bootstrap' || mode === 'degraded_boot') {
        packet.bootstrap_prompt = 'Use current CStar state and bounded evidence. '.repeat(14);
    }

    if (mode === 'live_run_delta') {
        packet.live_runs = [{
            run_id: 'run-example',
            status: 'active',
            row_counts: {
                completed: 1,
                expected: 2,
                malformed: 0,
                excluded: 0,
            },
            spend_boundary: 'no spend',
            evidence_refs: [],
            next_check_policy: 'pause for callback',
        }];
    }

    return packet;
}

function compileSchema(): ValidateFunction {
    const schema = JSON.parse(read(SCHEMA_PATH));
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    return ajv.compile(schema);
}

function errorText(validate: ValidateFunction): string {
    return JSON.stringify(validate.errors, null, 2);
}

describe('CoS context refresh primer', () => {
    it('keeps the machine-readable schema valid and bounded', () => {
        const schema = JSON.parse(read(SCHEMA_PATH));
        const validate = compileSchema();

        assert.strictEqual(schema.properties.schema_version.const, 'cos.context_refresh.v1');
        assert(schema.required.includes('control_plane'));
        assert(schema.required.includes('pennyone'));
        assert(!schema.required.includes('bootstrap_prompt'));
        assert(schema.properties.token_policy.properties.bootstrap_target_tokens.maximum <= 4000);
        assert.strictEqual(validate(packetFixture('bootstrap')), true, errorText(validate));
    });

    it('enforces mode-specific packet semantics with real schema validation', () => {
        const validate = compileSchema();

        for (const mode of ['bootstrap', 'refresh_delta', 'live_run_delta', 'closeout', 'degraded_boot'] as RefreshMode[]) {
            const packet = packetFixture(mode);
            assert.strictEqual(validate(packet), true, `${mode}: ${errorText(validate)}`);
        }

        const invalidPackets: Packet[] = [];

        const malformedDate = structuredClone(packetFixture('bootstrap'));
        malformedDate.generated_at = 'not-a-date';
        invalidPackets.push(malformedDate);

        const unknownProperty = structuredClone(packetFixture('bootstrap'));
        unknownProperty.untracked_state = true;
        invalidPackets.push(unknownProperty);

        const shortPrompt = structuredClone(packetFixture('bootstrap'));
        shortPrompt.bootstrap_prompt = 'too short';
        invalidPackets.push(shortPrompt);

        const missingPrompt = structuredClone(packetFixture('bootstrap'));
        delete missingPrompt.bootstrap_prompt;
        invalidPackets.push(missingPrompt);

        const emptyAuthority = structuredClone(packetFixture('bootstrap'));
        emptyAuthority.authority.operator_gates = [];
        invalidPackets.push(emptyAuthority);

        const blankAuthority = structuredClone(packetFixture('bootstrap'));
        blankAuthority.authority.operator_gates = [''];
        invalidPackets.push(blankAuthority);

        const emptyVerification = structuredClone(packetFixture('bootstrap'));
        emptyVerification.verification.before_success_claim = [];
        invalidPackets.push(emptyVerification);

        const invalidTokenTarget = structuredClone(packetFixture('bootstrap'));
        invalidTokenTarget.token_policy.live_delta_target_tokens = 0;
        invalidPackets.push(invalidTokenTarget);

        const oversizedTokenTarget = structuredClone(packetFixture('bootstrap'));
        oversizedTokenTarget.token_policy.bootstrap_target_tokens = 4001;
        invalidPackets.push(oversizedTokenTarget);

        const unexpectedDeltaPrompt = structuredClone(packetFixture('refresh_delta'));
        unexpectedDeltaPrompt.bootstrap_prompt = 'This prompt does not belong in a delta. '.repeat(14);
        invalidPackets.push(unexpectedDeltaPrompt);

        const emptyLiveDelta = structuredClone(packetFixture('live_run_delta'));
        emptyLiveDelta.live_runs = [];
        invalidPackets.push(emptyLiveDelta);

        const healthyDegradedBoot = structuredClone(packetFixture('degraded_boot'));
        healthyDegradedBoot.control_plane.doctor_status = 'healthy';
        invalidPackets.push(healthyDegradedBoot);

        const disabledDegradedFallback = structuredClone(packetFixture('degraded_boot'));
        disabledDegradedFallback.control_plane.degraded_fallback.enabled = false;
        invalidPackets.push(disabledDegradedFallback);

        const invalidChecksum = structuredClone(packetFixture('bootstrap'));
        invalidChecksum.control_plane.state_checksum = '';
        invalidPackets.push(invalidChecksum);

        const invalidArtifactHash = structuredClone(packetFixture('bootstrap'));
        invalidArtifactHash.artifact_index[0].sha256 = 'not-a-sha256';
        invalidPackets.push(invalidArtifactHash);

        for (const packet of invalidPackets) {
            assert.strictEqual(validate(packet), false, `unexpectedly valid: ${packet.refresh_id}`);
        }
    });

    it('documents the required handoff controls for a fresh CoS thread', () => {
        const doc = read(DOC_PATH);

        for (const required of [
            'CStar is the axle',
            'PMTs are information repositories only',
            'MM is legacy',
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
        assert.match(packet, /only when health is unknown or degraded/);
        assert.match(packet, /MM is legacy/);
        assert.match(packet, /PMTs are information repositories only/);
        assert.match(packet, /perfect_score_review_pending/);
        assert.match(packet, /static bootstrap baseline/);
        assert.match(packet, /not.*cos\.context_refresh\.v1.*packet/i);
        assert.match(packet, /Source refresh bead:[\s\S]*RESOLVED/);
        assert.match(packet, /Test counts are not durable state/);
        assert.doesNotMatch(packet, /Active refresh bead/);
        assert.doesNotMatch(packet, /Focused primer test:\s*`4\/4 PASS`/);
    });

    it('keeps a Sterling lore contract for the primer behavior', () => {
        const feature = read(FEATURE_PATH);

        assert.match(feature, /Fresh CoS context is restored from durable state/);
        assert.match(feature, /perfect scores as review-pending/);
        assert.match(feature, /forbid raw transcript or log replay/);
        assert.match(feature, /Static bootstrap guidance cannot masquerade as current state/);
        assert.match(feature, /schema mode invariants must be validated/);
    });
});
