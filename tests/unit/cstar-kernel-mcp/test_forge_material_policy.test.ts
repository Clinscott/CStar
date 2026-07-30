import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ForgeExecutionArgs } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_contract.js';
import {
    FORGE_MODEL_MATERIAL_POLICY,
    prepareForgeWorkspaceProjection,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_workspace_projection.js';

const roots: string[] = [];

function fixture() {
    const control = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-material-control-'));
    const project = path.join(control, 'project');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-material-private-'));
    fs.mkdirSync(project, { mode: 0o700 });
    roots.push(control, temporary);
    return { control, project, temporary };
}

function args(targets: string[], outputs = targets): ForgeExecutionArgs {
    return {
        target_paths: targets,
        required_output_paths: outputs,
        package_locks: [],
    } as unknown as ForgeExecutionArgs;
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge model-material policy', () => {
    it('accepts the 72,363-byte regression target', () => {
        const item = fixture();
        const target = path.join(item.project, 'large-reference.md');
        fs.writeFileSync(target, 'a'.repeat(72_363));
        const projection = prepareForgeWorkspaceProjection(
            args([target]), item.control, item.project, item.temporary,
        );
        assert.equal(projection.source_preimages[0]?.bytes, 72_363);
        assert.equal(FORGE_MODEL_MATERIAL_POLICY.file_max_bytes, 512 * 1024);
    });

    it('accepts the exact aggregate cap and rejects one byte more', () => {
        for (const extra of [0, 1]) {
            const item = fixture();
            const targets = Array.from({ length: 4 }, (_unused, index) => {
                const target = path.join(item.project, `part-${index}.ts`);
                fs.writeFileSync(target, 'x'.repeat(128 * 1024));
                return target;
            });
            if (extra) {
                const tail = path.join(item.project, 'tail.ts');
                fs.writeFileSync(tail, 'x');
                targets.push(tail);
            }
            const run = () => prepareForgeWorkspaceProjection(
                args(targets), item.control, item.project, item.temporary,
            );
            if (extra) assert.throws(run, /forge_workspace_target_material_too_large/);
            else assert.equal(run().source_preimages.length, 4);
        }
    });

    it('represents an authorized prospective output without source bytes', () => {
        const item = fixture();
        const target = path.join(item.project, 'new', 'continuation.ts');
        const projection = prepareForgeWorkspaceProjection(
            args([target]), item.control, item.project, item.temporary,
        );
        assert.equal(projection.outputs[0]?.initial.kind, 'missing');
        assert.equal(projection.outputs[0]?.initial.bytes, 0);
    });
});
