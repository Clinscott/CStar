import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { crawlRepository } from '../../src/tools/pennyone/crawler.ts';

describe('PennyOne crawler fallback', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-crawler-'));
        fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'node_modules', 'pkg'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, '.stats'), { recursive: true });

        fs.writeFileSync(path.join(tmpRoot, 'src', 'main.ts'), 'export const main = true;\n', 'utf-8');
        fs.writeFileSync(path.join(tmpRoot, 'docs', 'guide.md'), '# guide\n', 'utf-8');
        fs.writeFileSync(path.join(tmpRoot, 'node_modules', 'pkg', 'index.ts'), 'export {};\n', 'utf-8');
        fs.writeFileSync(path.join(tmpRoot, '.stats', 'noise.md'), 'noise\n', 'utf-8');
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('falls back to filesystem crawling for non-git directories', async () => {
        const files = await crawlRepository(tmpRoot);
        const normalized = files.map((file) => file.replace(/\\/g, '/')).sort();

        assert.deepStrictEqual(normalized, [
            path.join(tmpRoot, 'docs', 'guide.md').replace(/\\/g, '/'),
            path.join(tmpRoot, 'src', 'main.ts').replace(/\\/g, '/'),
        ]);
    });
});
