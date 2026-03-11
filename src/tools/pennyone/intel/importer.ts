import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

import { StateRegistry } from '../../../node/core/state.ts';
import {
    getHallMountedSpoke,
    getHallRepositoryRecord,
    saveHallMountedSpoke,
} from './database.ts';
import { registry } from '../pathRegistry.ts';
import { runScan } from '../index.ts';
import type { HallMountedSpokeRecord } from '../../../types/hall.ts';

function inferSlug(source: string): string {
    const trimmed = source.replace(/\/+$/, '');
    const lastSegment = trimmed.split(/[\\/]/).pop() ?? 'repo';
    return lastSegment.replace(/\.git$/i, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function resolveGalleryRoot(workspaceRoot: string): string {
    return path.join(workspaceRoot, '.estate', 'gallery');
}

export async function importRepositoryIntoEstate(
    source: string,
    options: {
        slug?: string;
        workspaceRoot?: string;
        scanRunner?: (targetPath: string) => Promise<unknown>;
        cloneRunner?: (sourcePath: string, targetPath: string, workspaceRoot: string) => Promise<void>;
    } = {},
): Promise<HallMountedSpokeRecord> {
    const workspaceRoot = options.workspaceRoot ?? registry.getRoot();
    registry.setRoot(workspaceRoot);
    StateRegistry.save(StateRegistry.get());

    const repo = getHallRepositoryRecord(workspaceRoot);
    if (!repo) {
        throw new Error('Failed to materialize the brain repository before PennyOne import.');
    }

    const slug = options.slug ?? inferSlug(source);
    const galleryRoot = resolveGalleryRoot(workspaceRoot);
    const targetPath = path.join(galleryRoot, slug);
    const normalizedTargetPath = registry.normalize(targetPath);
    fs.mkdirSync(galleryRoot, { recursive: true });

    if (!fs.existsSync(normalizedTargetPath)) {
        if (options.cloneRunner) {
            await options.cloneRunner(source, normalizedTargetPath, workspaceRoot);
        } else {
            await execa('git', ['clone', '--depth', '1', source, normalizedTargetPath], {
                cwd: workspaceRoot,
            });
        }
    }

    const existing = getHallMountedSpoke(slug, workspaceRoot);
    const now = Date.now();
    const mounted: HallMountedSpokeRecord = {
        spoke_id: existing?.spoke_id ?? `spoke:${slug}`,
        repo_id: repo.repo_id,
        slug,
        kind: 'git',
        root_path: normalizedTargetPath,
        remote_url: source,
        default_branch: existing?.default_branch ?? 'main',
        mount_status: 'active',
        trust_level: 'observe',
        write_policy: 'read_only',
        projection_status: 'missing',
        created_at: existing?.created_at ?? now,
        updated_at: now,
        metadata: {
            ...(existing?.metadata ?? {}),
            source: 'pennyone_import',
        },
    };
    saveHallMountedSpoke(mounted);

    const scanRunner = options.scanRunner ?? runScan;
    await scanRunner(normalizedTargetPath);

    const projected: HallMountedSpokeRecord = {
        ...mounted,
        projection_status: 'current',
        last_scan_at: Date.now(),
        updated_at: Date.now(),
    };
    saveHallMountedSpoke(projected);
    StateRegistry.save(StateRegistry.get());
    return projected;
}
