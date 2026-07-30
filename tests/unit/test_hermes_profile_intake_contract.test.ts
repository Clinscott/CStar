import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = process.cwd();
const INTAKE_ROOT = path.join(ROOT, 'docs/operations/hermes-profile-intake');
const README_PATH = path.join(INTAKE_ROOT, 'README.md');
const POLICY_PATH = path.join(INTAKE_ROOT, 'intake-policy.v1.json');
const SCHEMA_PATH = path.join(INTAKE_ROOT, 'inventory-manifest.schema.json');
const EXAMPLE_PATH = path.join(INTAKE_ROOT, 'inventory-manifest.example.json');

type JsonObject = Record<string, unknown>;

function read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

function parse(filePath: string): JsonObject {
    return JSON.parse(read(filePath)) as JsonObject;
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

const requiredExclusions = [
    'profile_contents',
    'oauth_state',
    'tokens',
    'credentials',
    'commands',
    'endpoints',
    'logs',
    'sessions',
    'databases',
    'runtime_state',
    'local_secret_paths',
    'live_configuration',
] as const;

const deniedAuthorities = [
    'worker_enrollment',
    'source_authority',
    'execution',
    'spend',
    'provider_selection',
    'model_selection',
    'profile_mutation',
    'activation',
] as const;

describe('Hermes profile intake contract', () => {
    it('contains only the metadata-first package artifacts', () => {
        assert.deepEqual(
            fs.readdirSync(INTAKE_ROOT).sort(),
            [
                'README.md',
                'intake-policy.v1.json',
                'inventory-manifest.example.json',
                'inventory-manifest.schema.json',
            ],
        );
    });

    it('validates the sanitized example against the closed schema', () => {
        const schema = parse(SCHEMA_PATH);
        const example = parse(EXAMPLE_PATH);
        const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

        assert.equal(validate(example), true, JSON.stringify(validate.errors));
        assert.equal(example.phase, 'metadata_only');

        const candidates = example.candidates as JsonObject[];
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0]?.sha256, null);
        assert.match(String(candidates[0]?.relative_path), /^[^/~][^\\]*$/);

        for (const relativePath of [
            '/local/profile/SKILL.md',
            '../profile/SKILL.md',
            'oauth/state.json',
            'secrets/credential.json',
            'runtime/session.json',
        ]) {
            const payload = clone(example);
            const unsafeCandidates = payload.candidates as JsonObject[];
            unsafeCandidates[0]!.relative_path = relativePath;
            assert.equal(validate(payload), false, `schema accepted path: ${relativePath}`);
        }
    });

    it('excludes sensitive/runtime fields and fixes all intake authority to false', () => {
        const policy = parse(POLICY_PATH);
        const exclusions = policy.hard_exclusion_categories as string[];
        const forbiddenFields = policy.first_pass_forbidden_fields as string[];
        const authority = policy.authority_grants as Record<string, boolean>;
        const boundaries = policy.ownership_boundaries as Record<string, unknown>;

        for (const exclusion of requiredExclusions) {
            assert.ok(exclusions.includes(exclusion), `missing exclusion: ${exclusion}`);
        }
        for (const field of [
            'content',
            'oauth_state',
            'token',
            'credential',
            'command',
            'endpoint',
            'log',
            'session',
            'database',
            'runtime_state',
            'local_secret_path',
            'live_configuration',
        ]) {
            assert.ok(forbiddenFields.includes(field), `missing forbidden field: ${field}`);
        }
        for (const grant of deniedAuthorities) {
            assert.equal(authority[grant], false, `intake grants ${grant}`);
        }

        assert.equal(boundaries.oauth_profile, 'cstar-hub');
        assert.equal(boundaries.oauth_owner, 'hermes');
        assert.equal(boundaries.forge_lane, 'local_authorized_implementation');
        assert.equal(boundaries.researcher_lane, 'local_authorized_evidence');
        assert.equal(boundaries.intake_changes_boundaries, false);
    });

    it('rejects forbidden payload fields and any claimed authority', () => {
        const schema = parse(SCHEMA_PATH);
        const example = parse(EXAMPLE_PATH);
        const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

        for (const field of [
            'content',
            'oauth_state',
            'token',
            'credential',
            'command',
            'endpoint',
            'log',
            'session',
            'database',
            'runtime_state',
            'local_secret_path',
            'live_configuration',
        ]) {
            const payload = clone(example);
            const candidates = payload.candidates as JsonObject[];
            candidates[0]![field] = 'forbidden';
            assert.equal(validate(payload), false, `schema accepted ${field}`);
        }

        for (const grant of deniedAuthorities) {
            const payload = clone(example);
            const authority = payload.authority as Record<string, boolean>;
            authority[grant] = true;
            assert.equal(validate(payload), false, `schema granted ${grant}`);
        }
    });

    it('documents metadata-only handling and preserves local ownership lanes', () => {
        const readme = read(README_PATH).replace(/\s+/g, ' ');

        for (const required of [
            'no collector command',
            'Hermes continues to own and update the `cstar-hub` OAuth profile',
            'Corvus Forge builds implementation only through its separately authorized lifecycle',
            'Researcher gathers evidence only through separately authorized source lanes',
            'grants no worker enrollment, source authority, execution, spend, provider selection, model selection, profile mutation, or activation',
            'local secret paths',
            'live configuration',
        ]) {
            assert.ok(readme.includes(required), `README missing: ${required}`);
        }
    });
});
