import fs from 'node:fs';
import path from 'node:path';

import {
    SUPPORTED_GUNGNIR_EXTENSIONS,
    evaluateGungnirSource,
    type GungnirCalculusExtension,
    type GungnirBreach,
} from '../../../../core/engine/gungnir/calculus.js';
import type {
    CalculusWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import type { GungnirMatrix } from '../../../../types/gungnir.js';

export interface CalculusReport {
    schema_version: '1.0';
    coverage: 'heuristic';
    action: CalculusWeavePayload['action'];
    file: string;
    verdict: 'PASS' | 'BREACH';
    matrix: GungnirMatrix;
    breaches: readonly GungnirBreach[];
}

export class CalculusInputError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'CalculusInputError';
    }
}

function isOutsideRoot(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '..'
        || relative.startsWith(`..${path.sep}`)
        || path.isAbsolute(relative);
}

export function resolveCalculusTarget(
    workspaceRoot: string,
    requestedFile: string,
): { absolutePath: string; relativePath: string } {
    const trimmed = requestedFile.trim();
    if (!trimmed) {
        throw new CalculusInputError('FILE_REQUIRED', 'Gungnir Calculus requires a file path.');
    }

    let realRoot: string;
    try {
        realRoot = fs.realpathSync(workspaceRoot);
    } catch {
        throw new CalculusInputError(
            'WORKSPACE_UNAVAILABLE',
            `Selected workspace is unavailable: ${workspaceRoot}`,
        );
    }

    const lexicalTarget = path.resolve(realRoot, trimmed);
    if (isOutsideRoot(realRoot, lexicalTarget)) {
        throw new CalculusInputError(
            'PATH_OUTSIDE_WORKSPACE',
            'Gungnir Calculus only reads files inside the selected workspace.',
        );
    }

    let absolutePath: string;
    try {
        absolutePath = fs.realpathSync(lexicalTarget);
    } catch {
        throw new CalculusInputError('FILE_NOT_FOUND', `Calculus target does not exist: ${trimmed}`);
    }
    if (isOutsideRoot(realRoot, absolutePath)) {
        throw new CalculusInputError(
            'PATH_OUTSIDE_WORKSPACE',
            'Gungnir Calculus rejects symlinks that escape the selected workspace.',
        );
    }
    if (!fs.statSync(absolutePath).isFile()) {
        throw new CalculusInputError('TARGET_NOT_FILE', `Calculus target is not a file: ${trimmed}`);
    }

    return {
        absolutePath,
        relativePath: path.relative(realRoot, absolutePath).split(path.sep).join('/'),
    };
}

function failure(code: string, message: string): WeaveResult {
    return {
        weave_id: 'prime:calculus',
        status: 'FAILURE',
        output: '',
        error: message,
        metadata: {
            adapter: 'prime:calculus',
            context_policy: 'silent',
            error_code: code,
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        },
    };
}

export class CalculusAdapter implements RuntimeAdapter<CalculusWeavePayload> {
    public readonly id = 'prime:calculus';

    public async execute(
        invocation: WeaveInvocation<CalculusWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const { action, file } = invocation.payload;
        if (action !== 'score' && action !== 'audit') {
            return failure('INVALID_ACTION', 'Gungnir Calculus action must be score or audit.');
        }

        try {
            const target = resolveCalculusTarget(context.workspace_root, file);
            const extension = path.extname(target.absolutePath).toLowerCase();
            if (!SUPPORTED_GUNGNIR_EXTENSIONS.has(extension as GungnirCalculusExtension)) {
                throw new RangeError(`Unsupported Gungnir file extension ${JSON.stringify(extension)}.`);
            }
            const source = fs.readFileSync(target.absolutePath, 'utf-8');
            const evaluation = evaluateGungnirSource(source, extension);
            const report: CalculusReport = {
                schema_version: '1.0',
                coverage: evaluation.coverage,
                action,
                file: target.relativePath,
                verdict: evaluation.breaches.length === 0 ? 'PASS' : 'BREACH',
                matrix: evaluation.matrix,
                breaches: evaluation.breaches,
            };
            const output = action === 'score'
                ? `Gungnir score ${report.matrix.overall.toFixed(2)}/10 for ${report.file} (${report.breaches.length} breach(es)).`
                : `Gungnir audit ${report.verdict.toLowerCase()} for ${report.file} (${report.breaches.length} breach(es)).`;

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output,
                metadata: {
                    adapter: this.id,
                    context_policy: 'silent',
                    calculus: report,
                    execution_dispatched: true,
                    hall_mutation_started: false,
                    provider_attempted: false,
                    process_started: false,
                    source_access_started: true,
                },
            };
        } catch (error) {
            if (error instanceof CalculusInputError) {
                return failure(error.code, error.message);
            }
            if (error instanceof RangeError) {
                return failure('UNSUPPORTED_EXTENSION', error.message);
            }
            return failure(
                'CALCULUS_FAILED',
                error instanceof Error ? error.message : 'Gungnir Calculus failed.',
            );
        }
    }
}
