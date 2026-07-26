import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LEGACY_HEADER = ['//', 'Corvus Star Trace [Ω]'].join(' ');
const ACTIVE_ROOTS = [
    'AGENTS.md',
    'AGENTS.qmd',
    '.agents/extension',
    'plugins/corvus-star',
    'src',
];
const LEGACY_INPUT_BOUNDARY = path.normalize(
    'src/node/core/runtime/host_workflows/chant_parser.ts',
);
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.md', '.qmd', '.json']);

function sourceFiles(target: string): string[] {
    const absolute = path.join(ROOT, target);
    if (!fs.existsSync(absolute)) return [];
    if (fs.statSync(absolute).isFile()) {
        return TEXT_EXTENSIONS.has(path.extname(absolute)) ? [absolute] : [];
    }
    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules' || entry.name === 'legacy_archive') return [];
        return sourceFiles(path.relative(ROOT, path.join(absolute, entry.name)));
    });
}

describe('legacy Corvus Star Trace retirement invariant', () => {
    it('keeps the legacy selection header only at the parser input boundary', () => {
        const offenders = ACTIVE_ROOTS
            .flatMap(sourceFiles)
            .filter((filePath) => fs.statSync(filePath).isFile())
            .filter((filePath) => fs.readFileSync(filePath, 'utf-8').includes(LEGACY_HEADER))
            .map((filePath) => path.normalize(path.relative(ROOT, filePath)))
            .filter((relativePath) => relativePath !== LEGACY_INPUT_BOUNDARY);

        assert.deepEqual(offenders, []);
    });

    it('contains no active Trace-first or magic-comment compliance mandate', () => {
        const activeText = ACTIVE_ROOTS
            .flatMap(sourceFiles)
            .filter((filePath) => fs.statSync(filePath).isFile())
            .map((filePath) => fs.readFileSync(filePath, 'utf-8'))
            .join('\n');

        assert.doesNotMatch(activeText, /\bTrace First\b/i);
        assert.doesNotMatch(activeText, /\bTrace Enforcement\b/i);
        assert.doesNotMatch(activeText, /\btrace_compliance\b/i);
        assert.doesNotMatch(activeText, /missing Corvus Star Trace block/i);
    });

    it('documents the legacy header as deprecated input-only compatibility', () => {
        const parser = fs.readFileSync(path.join(ROOT, LEGACY_INPUT_BOUNDARY), 'utf-8');
        assert.match(parser, /LEGACY_TRACE_SELECTION_HEADER/);
        assert.match(parser, /deprecated_input/);
        assert.match(parser, /legacy_trace/);

        const contract = fs.readFileSync(
            path.join(ROOT, 'docs', 'trace-naming-contract.md'),
            'utf-8',
        );
        assert.match(contract, /Only the compatibility parser may accept/i);
        assert.match(contract, /No active instruction, hook,\s+HUD, source file, or generated response may require or emit it/i);
    });
});
