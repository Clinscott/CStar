import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

import {
    getHallDocument,
    listHallDocumentVersions,
    listHallDocuments,
    restoreHallDocumentVersion,
    saveHallDocumentSnapshot,
    upsertHallRepository,
} from '../../../tools/pennyone/intel/database.ts';
import { buildHallRepositoryId } from '../../../types/hall.js';

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
    const parts = normalized.split('/');
    return parts[1] ?? 'doctrine';
}

export function registerHallDocumentCommand(program: Command): void {
    const hallDoc = program
        .command('hall-doc')
        .description('Manage Hall-backed doctrine documents');

    hallDoc
        .command('ingest <repoRoot>')
        .description('Ingest markdown doctrine files from a repo into Hall')
        .option('--docs <docsRoot>', 'Docs directory relative to repo root', 'docs')
        .action((repoRoot: string, options: { docs?: string }) => {
            const resolvedRepoRoot = path.resolve(repoRoot);
            const docsRoot = path.resolve(resolvedRepoRoot, options.docs ?? 'docs');
            if (!fs.existsSync(docsRoot) || !fs.statSync(docsRoot).isDirectory()) {
                console.error(chalk.red(`Docs root does not exist or is not a directory: ${docsRoot}`));
                process.exit(1);
            }

            const now = Date.now();
            upsertHallRepository({
                repo_id: buildHallRepositoryId(resolvedRepoRoot),
                root_path: resolvedRepoRoot,
                name: path.basename(resolvedRepoRoot),
                status: 'AWAKE',
                active_persona: 'O.D.I.N.',
                baseline_gungnir_score: 0,
                intent_integrity: 1,
                metadata: { source: 'hall-doc-ingest' },
                created_at: now,
                updated_at: now,
            });

            const snapshots = listMarkdownFiles(docsRoot).map((filePath, index) => {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relativePath = path.relative(resolvedRepoRoot, filePath).replace(/\\/g, '/');
                return saveHallDocumentSnapshot({
                    root_path: resolvedRepoRoot,
                    document_path: relativePath,
                    content,
                    doc_kind: inferDocKind(relativePath),
                    source_label: 'hall-doc-ingest',
                    created_at: now + index,
                });
            });

            console.log(chalk.green(`Ingested ${snapshots.length} Hall document(s) for ${resolvedRepoRoot}.`));
        });

    hallDoc
        .command('list <repoRoot>')
        .description('List Hall-backed doctrine documents for a repo')
        .action((repoRoot: string) => {
            const documents = listHallDocuments(path.resolve(repoRoot));
            if (documents.length === 0) {
                console.log(chalk.dim('No Hall documents are registered for that repo.'));
                return;
            }
            console.log(chalk.cyan('\n ◤ HALL DOCUMENTS ◢ '));
            console.log(chalk.dim('━'.repeat(80)));
            for (const document of documents) {
                console.log(`${chalk.bold(document.doc_kind.padEnd(12))} ${chalk.blue(document.path)} ${chalk.dim(document.latest_version_id)}`);
            }
            console.log(chalk.dim('━'.repeat(80)));
        });

    hallDoc
        .command('restore <repoRoot> <documentPath>')
        .description('Restore a Hall-backed doctrine document version onto disk')
        .option('--version <versionId>', 'Specific Hall document version id to restore')
        .option('--out <path>', 'Override restore destination path')
        .action((repoRoot: string, documentPath: string, options: { version?: string; out?: string }) => {
            const resolvedRepoRoot = path.resolve(repoRoot);
            const document = getHallDocument(resolvedRepoRoot, documentPath);
            if (!document) {
                console.error(chalk.red(`Hall document not found: ${documentPath}`));
                process.exit(1);
            }

            const versionId = options.version ?? document.latest_version_id;
            const restored = restoreHallDocumentVersion(versionId, options.out ? path.resolve(options.out) : undefined);
            console.log(chalk.green(`Restored ${document.path} from ${versionId}.`));
            console.log(chalk.dim(restored.path));
        });

    hallDoc
        .command('versions <repoRoot> <documentPath>')
        .description('List stored Hall versions for one doctrine document')
        .action((repoRoot: string, documentPath: string) => {
            const document = getHallDocument(path.resolve(repoRoot), documentPath);
            if (!document) {
                console.error(chalk.red(`Hall document not found: ${documentPath}`));
                process.exit(1);
            }
            const versions = listHallDocumentVersions(document.document_id);
            if (versions.length === 0) {
                console.log(chalk.dim('No stored versions were found.'));
                return;
            }
            console.log(chalk.cyan(`\n ◤ HALL DOCUMENT VERSIONS: ${document.path} ◢ `));
            console.log(chalk.dim('━'.repeat(100)));
            for (const version of versions) {
                console.log(`${chalk.bold(version.version_id)} ${chalk.dim(version.summary ?? version.title)}`);
            }
            console.log(chalk.dim('━'.repeat(100)));
        });
}
