import fs from 'node:fs';
import path from 'node:path';

import { upsertHallRepository, saveHallDocumentSnapshot } from '../src/tools/pennyone/intel/database.ts';
import { buildHallRepositoryId } from '../src/types/hall.js';

const xoRoot = '/home/morderith/Corvus/XO';
const docsRoot = path.join(xoRoot, 'docs');
const now = Date.now();

function listMarkdownFiles(rootPath: string): string[] {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...listMarkdownFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files.sort();
}

function inferDocKind(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('docs/foundation/')) return 'foundation';
    if (normalized.startsWith('docs/planning/')) return 'planning';
    return 'doctrine';
}

upsertHallRepository({
    repo_id: buildHallRepositoryId(xoRoot),
    root_path: xoRoot,
    name: 'XO',
    status: 'AWAKE',
    active_persona: 'O.D.I.N.',
    baseline_gungnir_score: 0,
    intent_integrity: 1,
    metadata: {
        source: 'ingest_xo_doctrine_to_hall',
    },
    created_at: now,
    updated_at: now,
});

const snapshots = listMarkdownFiles(docsRoot).map((filePath, index) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(xoRoot, filePath).replace(/\\/g, '/');
    return saveHallDocumentSnapshot({
        root_path: xoRoot,
        document_path: relativePath,
        content,
        doc_kind: inferDocKind(relativePath),
        source_label: 'xo-doctrine-ingest',
        metadata: {
            relative_path: relativePath,
        },
        created_at: now + index,
    });
});

console.log(JSON.stringify({
    repo: xoRoot,
    ingested_documents: snapshots.length,
    changed_documents: snapshots.filter((entry) => entry.changed).length,
    document_paths: snapshots.map((entry) => entry.document.path),
}, null, 2));
