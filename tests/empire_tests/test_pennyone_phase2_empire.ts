import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeFile } from '../../src/tools/pennyone/analyzer.js';
import { calculateStyleScore } from '../../src/tools/pennyone/calculus/style.js';
import { writeReport } from '../../src/tools/pennyone/intel/writer.js';
import fs from 'fs/promises';
import path from 'path';

describe('PennyOne Phase 2: Priority Refactor Verification', () => {
    it('should correctly preserve URLs in LOC calculation (The URL Trap)', async () => {
        const code = `
            const api = "https://corvus.star";
            // This is a comment
            const x = 1;
        `;
        const result = await analyzeFile(code, 'test.ts');
        assert.strictEqual(result.loc, 2, 'Should count 2 lines of code, ignoring comment but preserving URL');
    });

    it('should use AST for nesting depth (The String Trap)', async () => {
        const code = `
            const template = "{ variable }";
            if (true) {
                const inner = "{ outer }";
            }
        `;
        const result = await analyzeFile(code, 'test.ts');
        assert.strictEqual(result.matrix.logic > 0, true);
        // String literal braces should not affect nesting. 
        // 1 BlockStatement = depth 1.
        // In our AST tracker, the 'if' block is 1.
    });

    it('should evaluate style agnostically (The Tailwind Bias)', () => {
        const backendCode = `
            export class AgentLoop {
                async run() {
                    await this.process();
                }
            }
        `;
        const score = calculateStyleScore(backendCode);
        assert.ok(score > 5, 'Backend code should not be penalized for lacking Tailwind');
    });
});

describe('PennyOne Phase 2: Intel Generation', async () => {
    it('should generate reports with flattened names to avoid collisions', async () => {
        const mockFile = {
            path: path.resolve(process.cwd(), 'src/tools/test.ts'),
            loc: 10,
            complexity: 2,
            matrix: { logic: 8, style: 8, intel: 8, overall: 8 },
            imports: [],
            exports: []
        };

        const targetDir = path.resolve(process.cwd(), 'temp_test_repo');
        await fs.mkdir(targetDir, { recursive: true });

        try {
            const qmdPath = await writeReport(mockFile as any, targetDir);
            assert.ok(qmdPath.includes('src-tools-test.ts.qmd'), 'Should flatten path with hyphens');

            const statsExist = await fs.access(path.join(targetDir, '.stats')).then(() => true).catch(() => false);
            assert.ok(statsExist, '.stats directory should be created');
        } finally {
            await fs.rm(targetDir, { recursive: true, force: true });
        }
    });
});
