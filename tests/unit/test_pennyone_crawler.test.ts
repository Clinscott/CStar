import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    crawlRepository,
    PENNYONE_CRAWLER_RETIRED_ERROR,
} from '../../src/tools/pennyone/crawler.js';

describe('retired PennyOne crawler', () => {
    it('fails before Git or filesystem discovery', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-crawler-retired-'));
        try {
            fs.writeFileSync(path.join(root, 'secret.txt'), 'must-not-be-read');
            const before = fs.readFileSync(path.join(root, 'secret.txt'), 'utf8');
            await assert.rejects(crawlRepository(root), new RegExp(PENNYONE_CRAWLER_RETIRED_ERROR));
            assert.equal(fs.readFileSync(path.join(root, 'secret.txt'), 'utf8'), before);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('contains no process or filesystem crawler implementation', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'src/tools/pennyone/crawler.ts'),
            'utf8',
        );
        assert.doesNotMatch(source, /execa|child_process|readdir|statSync|existsSync|git\b/);
    });
});
