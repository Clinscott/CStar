import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { parseCanonicalPersona, type CanonicalPersona } from '../../../core/persona_contract.js';
import { getHallRepositoryRecord } from '../../pennyone/intel/database.js';
import { upsertHallRepository } from '../../pennyone/intel/repository_core.js';
import { registry } from '../../pennyone/pathRegistry.js';
import {
    buildPersonaProjectionMetadata,
    readBoundedConfiguredPersonaState,
} from '../../pennyone/persona_projection.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CODE_ROOT, resolveExistingPathInside } from '../contracts/runtime.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';

export interface PersonaSetArgs {
    persona: CanonicalPersona;
}

interface PersonaWriterResult {
    status: 'updated' | 'already_active';
    previous_persona: CanonicalPersona | null;
    active_persona: CanonicalPersona;
    changed: boolean;
    config_sha256: string;
}

const WRITER_MAX_OUTPUT_BYTES = 2_048;
const WRITER_ERROR = /^persona_[a-z0-9_]+$/;
const DIGEST = /^[a-f0-9]{64}$/;

function resolveSystemPython(): string {
    if (process.platform !== 'linux') throw new Error('persona_writer_platform_unsupported');
    const resolved = fs.realpathSync('/usr/bin/python3');
    const stat = fs.statSync(resolved);
    if (path.dirname(resolved) !== '/usr/bin'
        || !/^python3(?:\.\d+)*$/.test(path.basename(resolved))
        || !stat.isFile() || stat.uid !== 0
        || (stat.mode & 0o111) === 0 || (stat.mode & 0o022) !== 0) {
        throw new Error('persona_writer_python_unsafe');
    }
    return resolved;
}

function resolveWriterScript(): string {
    const script = resolveExistingPathInside(
        CODE_ROOT,
        path.join(CODE_ROOT, 'scripts', 'set_active_persona.py'),
        'file',
    );
    const stat = fs.statSync(script);
    if (typeof process.getuid !== 'function' || stat.uid !== process.getuid()
        || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) {
        throw new Error('persona_writer_script_unsafe');
    }
    return script;
}

function parseWriterResult(stdout: string, expected: CanonicalPersona): PersonaWriterResult {
    let parsed: unknown;
    try { parsed = JSON.parse(stdout); } catch { throw new Error('persona_writer_response_invalid'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('persona_writer_response_invalid');
    }
    const record = parsed as Record<string, unknown>;
    if (record.status !== 'updated' && record.status !== 'already_active') {
        const code = typeof record.error === 'string' && WRITER_ERROR.test(record.error)
            ? record.error : 'persona_writer_failed';
        throw new Error(code);
    }
    const activePersona = parseCanonicalPersona(record.active_persona);
    const previousPersona = record.previous_persona === null
        ? null : parseCanonicalPersona(record.previous_persona);
    if (activePersona !== expected
        || (record.previous_persona !== null && !previousPersona)
        || typeof record.changed !== 'boolean'
        || typeof record.config_sha256 !== 'string'
        || !DIGEST.test(record.config_sha256)) {
        throw new Error('persona_writer_response_invalid');
    }
    return {
        status: record.status,
        previous_persona: previousPersona,
        active_persona: activePersona,
        changed: record.changed,
        config_sha256: record.config_sha256,
    };
}

function mirrorPersonaToHall(root: string, persona: CanonicalPersona): 'updated' | 'missing' {
    const repository = getHallRepositoryRecord(root, root);
    if (!repository) return 'missing';
    upsertHallRepository({
        ...repository,
        active_persona: persona,
        metadata: {
            ...(repository.metadata ?? {}),
            ...buildPersonaProjectionMetadata(persona),
        },
        updated_at: Date.now(),
    });
    return 'updated';
}

function personaOperatingMode(persona: CanonicalPersona): Record<string, unknown> {
    return persona === 'O.D.I.N.' ? {
        mode: 'iterative_build_run_test_repair',
        iteration_required: true,
        emphasis: 'make the smallest useful increment, run it, inspect evidence, and repair again',
    } : {
        mode: 'secure_harden_verify',
        iteration_required: true,
        emphasis: 'reduce risk, harden the boundary, and independently verify the result',
    };
}

export async function handlePersonaSet(
    args: PersonaSetArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    try {
        const persona = parseCanonicalPersona(args.persona);
        if (!persona) throw new Error('persona_canonical_value_required');
        const identity = await verifyCodexRequestIdentity(requestContext);
        const root = registry.getRoot();
        const result = spawnSync(
            resolveSystemPython(),
            ['-I', '-S', '-B', resolveWriterScript(), root, persona],
            {
                cwd: '/',
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 5_000,
                maxBuffer: WRITER_MAX_OUTPUT_BYTES,
                env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
            },
        );
        if (result.error) throw new Error('persona_writer_unavailable');
        const writer = parseWriterResult(result.stdout, persona);
        if (result.status !== 0) throw new Error('persona_writer_failed');
        const projected = readBoundedConfiguredPersonaState(root);
        if (projected.status !== 'projected' || projected.active_persona !== persona) {
            throw new Error('persona_projection_verification_failed');
        }
        let hallProjection: 'updated' | 'missing' | 'failed' = 'failed';
        try { hallProjection = mirrorPersonaToHall(root, persona); } catch { hallProjection = 'failed'; }
        return textResponse({
            status: writer.status,
            persona,
            previous_persona: writer.previous_persona,
            effective_from: 'next_workflow_boundary',
            authority: 'style_only_no_scope_or_gate_change',
            operating_mode: personaOperatingMode(persona),
            config_sha256: writer.config_sha256,
            hall_projection: hallProjection,
            requested_by: {
                thread_id: identity.thread_id,
                turn_id: identity.turn_id,
            },
            ...(hallProjection === 'updated' ? {} : {
                freshness_gap: 'hall_persona_projection_not_updated',
            }),
        });
    } catch (error) {
        return errorResponse(error);
    }
}
