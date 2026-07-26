import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const PROTOCOL_PATH = path.join(ROOT, 'docs/operations/incremental-improvement-protocol.md');
const FEATURE_PATH = path.join(ROOT, 'tests/features/incremental_improvement_protocol.feature');
const LEGACY_LEDGER_PATH = path.join(ROOT, 'docs/campaigns/SOVEREIGNFISH_LEDGER.qmd');

function read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

function normalized(filePath: string): string {
    return read(filePath).replace(/\s+/g, ' ');
}

describe('incremental improvement protocol', () => {
    it('keeps AGENTS.md compact and delegates details to one canonical document', () => {
        const agents = read(AGENTS_PATH);
        const pointer = 'docs/operations/incremental-improvement-protocol.md';

        assert.equal(agents.split('\n').length <= 105, true);
        assert.equal(agents.split(pointer).length - 1, 2);
        assert.doesNotMatch(agents, /DURABLE — REMOTE BRANCH VERIFIED/);
        assert.doesNotMatch(agents, /\/home\/[^/\s]+\/\.hermes\//);
    });

    it('requires matched experiments and evidence-based retention', () => {
        const protocol = normalized(PROTOCOL_PATH);

        for (const required of [
            'one hypothesis',
            'matched baseline',
            'one bounded implementation slice',
            'Retain, revise, or revert',
            'Gungnir must improve or remain stable',
            'unavailable rather than invented',
        ]) {
            assert.match(protocol, new RegExp(required, 'i'));
        }
    });

    it('defines unambiguous durability and deferred merge states', () => {
        const protocol = normalized(PROTOCOL_PATH);

        for (const required of [
            'DURABLE — REMOTE BRANCH VERIFIED',
            'DURABLE — RECOVERY CHECKPOINT VERIFIED',
            'TRANSIENT ONLY — AT RISK',
            'CorvusEye red-team review is a mandatory pre-merge gate',
            'Do not run or claim that gate',
        ]) {
            assert.match(protocol, new RegExp(required));
        }
    });

    it('supersedes the historical five-unrelated-improvements mandate', () => {
        const protocol = normalized(PROTOCOL_PATH);
        const legacyLedger = read(LEGACY_LEDGER_PATH);

        assert.match(protocol, /historical campaign ledger/i);
        assert.match(protocol, /five unrelated improvements per session is not active policy/i);
        assert.match(legacyLedger, /SovereignFish: The Protocol of Incremental Excellence/);
    });

    it('keeps a Sterling lore contract for the improvement loop', () => {
        const feature = read(FEATURE_PATH);

        assert.match(feature, /one coherent candidate change/);
        assert.match(feature, /remote branch ref must be read back/);
        assert.match(feature, /must not merge before its deferred CorvusEye gate/);
    });
});
