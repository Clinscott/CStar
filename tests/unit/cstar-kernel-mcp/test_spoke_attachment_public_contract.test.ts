import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { handleSpokeAttachment } from '../../../src/tools/cstar-kernel-mcp/tools/spoke_attachment.js';

function makeRepository(): string {
    const root = fs.mkdtempSync(path.join('/home/morderith/Corvus', 'cstar-attachment-public-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic public fixture.\n', { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
    return root;
}

function errorCode(response: Awaited<ReturnType<typeof handleSpokeAttachment>>): string {
    const parsed = JSON.parse(response.content[0]!.text) as { error?: string };
    assert.equal(response.isError, true);
    return String(parsed.error);
}

function readRepositoryFile(relativePath: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('cstar_spoke_attachment public mutation boundary', () => {
    it('requires request-scoped current-turn authority for project and performs no repository write', async () => {
        const root = makeRepository();
        const slug = path.basename(root).toLowerCase();
        try {
            const result = await handleSpokeAttachment({ action: 'project', slug, root_path: root });
            assert.match(errorCode(result), /codex|request_context|operator/i);
            assert.equal(fs.existsSync(path.join(root, '.cstar')), false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects authority_source for project and unlink before any Hall mutation', async () => {
        const root = makeRepository();
        const slug = path.basename(root).toLowerCase();
        try {
            for (const action of ['project', 'unlink'] as const) {
                const result = await handleSpokeAttachment({
                    action,
                    slug,
                    root_path: root,
                    authority_source: { kind: 'current_root_turn' },
                });
                assert.equal(errorCode(result), 'spoke_attachment_authority_source_forbidden');
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps arbitrary metadata outside the accepted mutation contract', async () => {
        const result = await handleSpokeAttachment({
            action: 'link',
            slug: 'synthetic',
            root_path: '/home/morderith/Corvus/synthetic',
            metadata: { operator_text: 'synthetic-secret' },
        } as any);
        assert.equal(errorCode(result), 'spoke_attachment_args_invalid');
        assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
    });

    it('distinguishes private mounted-root persistence from authority records and public redaction', () => {
        const runtimeSchema = readRepositoryFile(
            'src/tools/pennyone/intel/schema_tables_runtime.ts',
        );
        const attachmentSchema = readRepositoryFile(
            'src/tools/pennyone/intel/spoke_attachment_schema_runtime.ts',
        );
        const attachmentRecords = readRepositoryFile(
            'src/tools/pennyone/intel/spoke_attachment_store_records.ts',
        );
        const publicSpokeTool = readRepositoryFile(
            'src/tools/cstar-kernel-mcp/tools/spoke.ts',
        );
        const integrationGuide = readRepositoryFile('docs/integrations/cstar-kernel-mcp.md');
        const authorityBoundary = readRepositoryFile(
            'docs/operations/spoke-projection-authority-boundary.md',
        );

        const mountedTable = runtimeSchema.match(
            /CREATE TABLE IF NOT EXISTS hall_mounted_spokes \(([\s\S]*?)\n\s*\);/,
        );
        assert.ok(mountedTable, 'private legacy mounted-spoke table must remain present');
        assert.match(mountedTable[1]!, /\broot_path TEXT NOT NULL\b/);
        assert.doesNotMatch(attachmentSchema, /\broot_path\s+TEXT\b/);

        const metadataBuilder = attachmentRecords.match(
            /export function attachmentMetadataJson\([\s\S]*?\n\}/,
        );
        assert.ok(metadataBuilder, 'attachment metadata builder must remain inspectable');
        assert.match(metadataBuilder[0], /schema:[\s\S]*receipt_id:[\s\S]*receipt_sha256:/);
        assert.doesNotMatch(metadataBuilder[0], /root_path|canonical_root/);

        const publicProjection = publicSpokeTool.match(
            /function redactedSpoke\([\s\S]*?\n\}/,
        );
        assert.ok(publicProjection, 'public spoke projection must remain inspectable');
        assert.doesNotMatch(publicProjection[0], /\broot_path\s*:/);
        assert.doesNotMatch(publicProjection[0], /\breceipt_id\s*:/);

        for (const document of [integrationGuide, authorityBoundary]) {
            assert.match(document, /private legacy `hall_mounted_spokes\.root_path`/);
            assert.match(document, /public projection[s]?[^.]*redact/i);
            assert.match(document, /none (?:stores|retains) the raw\s+root path/);
        }
    });
});
