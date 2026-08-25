import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 500;

function collectFiles(dir: string, suffixes: string[]): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(fullPath, suffixes));
        } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
            files.push(fullPath);
        }
    }
    return files;
}

function lineCount(filePath: string): number {
    const text = fs.readFileSync(filePath, 'utf8');
    if (text.length === 0) return 0;
    return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}

describe('CStar MCP file-size contract', () => {
    it('keeps MCP production, adapter, and focused test files under 500 lines', () => {
        const files = [
            path.join(ROOT, 'src/tools/cstar-kernel-mcp.ts'),
            path.join(ROOT, '.agents/skills/corvus-forge/scripts/forge_worker_adapter.py'),
            path.join(ROOT, '.agents/skills/corvus-forge/scripts/forge_worker_safety.py'),
            path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs'),
            path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_runtime_lineage.mjs'),
            path.join(ROOT, '.agents/skills/corvus-forge/scripts/forge_role_plan.mjs'),
            path.join(ROOT, 'tests/unit/test_cstar_kernel_mcp.test.ts'),
            path.join(ROOT, 'tests/unit/test_mcp_config_invariants.test.ts'),
            path.join(ROOT, 'tests/integration/cstar_kernel_mcp_stdio.test.ts'),
            ...collectFiles(path.join(ROOT, 'src/tools/cstar-kernel-mcp'), ['.ts']),
            ...collectFiles(path.join(ROOT, 'tests/unit/cstar-kernel-mcp'), ['.ts']),
        ];
        const oversized = files
            .map((file) => ({ file: path.relative(ROOT, file), lines: lineCount(file) }))
            .filter((entry) => entry.lines > MAX_LINES);

        assert.deepStrictEqual(oversized, []);
    });
});
