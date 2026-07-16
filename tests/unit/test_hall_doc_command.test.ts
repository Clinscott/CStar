import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    HALL_DOCUMENT_COMMAND_RETIRED_ERROR,
    registerHallDocumentCommand,
} from '../../src/node/core/commands/hall-doc.ts';

describe('retired Hall document command', () => {
    it('fails before reading doctrine or creating Hall state', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-hall-doc-'));
        const docs = path.join(root, 'docs');
        fs.mkdirSync(docs);
        fs.writeFileSync(path.join(docs, 'README.md'), 'synthetic fixture', 'utf-8');
        const before = fs.readdirSync(root, { recursive: true }).map(String).sort();

        const program = new Command().exitOverride();
        registerHallDocumentCommand(program);
        await assert.rejects(
            program.parseAsync(['node', 'test', 'hall-doc', 'ingest', root]),
            new RegExp(HALL_DOCUMENT_COMMAND_RETIRED_ERROR),
        );

        assert.deepEqual(fs.readdirSync(root, { recursive: true }).map(String).sort(), before);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        assert.equal(fs.existsSync(path.join(root, '.agents')), false);
    });
});
