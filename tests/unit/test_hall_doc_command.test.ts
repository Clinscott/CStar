import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerHallDocumentCommand } from '../../src/node/core/commands/hall-doc.ts';
import { closeDb } from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

describe('Hall document command lifecycle', () => {
    let hallRoot: string;
    let repoRoot: string;
    let originalLog: typeof console.log;
    let originalError: typeof console.error;
    let capturedLogs: string[];
    let capturedErrors: string[];

    beforeEach(() => {
        hallRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-hall-doc-'));
        fs.mkdirSync(path.join(hallRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(hallRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify(
                {
                    framework: {
                        status: 'AWAKE',
                        active_persona: 'ODIN',
                        gungnir_score: 90,
                        intent_integrity: 95,
                        last_awakening: 1700000000000,
                    },
                },
                null,
                2,
            ),
            'utf-8',
        );

        repoRoot = path.join(hallRoot, 'XO');
        fs.mkdirSync(path.join(repoRoot, 'docs', 'foundation'), { recursive: true });
        fs.writeFileSync(
            path.join(repoRoot, 'docs', 'foundation', 'XO_MEMORY_MODEL.md'),
            '# XO Memory Model\n\nDurable memory doctrine for XO.\n',
            'utf-8',
        );

        registry.setRoot(hallRoot);
        closeDb();

        capturedLogs = [];
        capturedErrors = [];
        originalLog = console.log;
        originalError = console.error;
        console.log = (...args: unknown[]) => {
            capturedLogs.push(args.map((value) => String(value)).join(' '));
        };
        console.error = (...args: unknown[]) => {
            capturedErrors.push(args.map((value) => String(value)).join(' '));
        };
    });

    afterEach(() => {
        console.log = originalLog;
        console.error = originalError;
        closeDb();
    });

    it('ingests, lists, versions, and restores doctrine documents', async () => {
        const program = new Command();
        registerHallDocumentCommand(program);

        await program.parseAsync(['node', 'test', 'hall-doc', 'ingest', repoRoot]);
        assert.equal(capturedErrors.length, 0);
        assert.match(capturedLogs.join('\n'), /Ingested 1 Hall document\(s\)/);

        capturedLogs = [];
        await program.parseAsync(['node', 'test', 'hall-doc', 'list', repoRoot]);
        const listOutput = capturedLogs.join('\n');
        assert.match(listOutput, /HALL DOCUMENTS/);
        assert.match(listOutput, /docs\/foundation\/XO_MEMORY_MODEL\.md/);

        capturedLogs = [];
        await program.parseAsync([
            'node',
            'test',
            'hall-doc',
            'versions',
            repoRoot,
            'docs/foundation/XO_MEMORY_MODEL.md',
        ]);
        const versionsOutput = capturedLogs.join('\n');
        assert.match(versionsOutput, /HALL DOCUMENT VERSIONS/);
        assert.match(versionsOutput, /docv:doc:/);

        const restoredPath = path.join(hallRoot, 'restored-memory-model.md');
        capturedLogs = [];
        await program.parseAsync([
            'node',
            'test',
            'hall-doc',
            'restore',
            repoRoot,
            'docs/foundation/XO_MEMORY_MODEL.md',
            '--out',
            restoredPath,
        ]);
        assert.match(capturedLogs.join('\n'), /Restored docs\/foundation\/XO_MEMORY_MODEL\.md/);
        assert.equal(fs.readFileSync(restoredPath, 'utf-8'), fs.readFileSync(path.join(repoRoot, 'docs', 'foundation', 'XO_MEMORY_MODEL.md'), 'utf-8'));
    });
});
