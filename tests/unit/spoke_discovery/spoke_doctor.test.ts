import test from 'node:test';
import assert from 'node:assert';

import {
    surveySpokesForRecords,
    type SpokeSurveyReport,
    type SpokeBucket,
} from '../../../src/node/core/spokes/spoke_doctor.ts';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';

const HUB = 'repo:/synthetic/hub';

function row(overrides: Partial<HallMountedSpokeRecord> & { slug: string }): HallMountedSpokeRecord {
    return {
        spoke_id: `spoke:${overrides.slug}`,
        repo_id: overrides.repo_id ?? HUB,
        slug: overrides.slug,
        kind: overrides.kind ?? 'local',
        root_path: overrides.root_path ?? `/synthetic/${overrides.slug}`,
        remote_url: overrides.remote_url,
        mount_status: overrides.mount_status ?? 'active',
        trust_level: overrides.trust_level ?? 'trusted',
        write_policy: overrides.write_policy ?? 'read_write',
        projection_status: overrides.projection_status ?? 'missing',
        metadata: overrides.metadata,
        created_at: 0,
        updated_at: 0,
    } as HallMountedSpokeRecord;
}

function bucketsBySlug(report: SpokeSurveyReport): Record<string, SpokeBucket[]> {
    const result: Record<string, SpokeBucket[]> = {};
    for (const entry of report.spokes) (result[entry.slug] ??= []).push(entry.bucket);
    return result;
}

test('survey is Hall-only and redacts roots, repository ids, remotes, and tokens', () => {
    const secret = 'synthetic-mount-token';
    const rootPath = '/home/synthetic/.hermes/private-profile';
    const report = surveySpokesForRecords([
        row({
            slug: 'safe-view',
            root_path: rootPath,
            remote_url: 'https://user:password@example.invalid/repo.git',
            projection_status: 'current',
            metadata: { authority: { mount_token: secret } },
        }),
    ], HUB);
    assert.strictEqual(report.counts.live, 1);
    assert.strictEqual(report.spokes[0].filesystem_observed, false);
    assert.match(report.spokes[0].root_sha256, /^[a-f0-9]{64}$/);
    assert.match(report.hub_repo_id_sha256, /^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /private-profile|password|synthetic-mount-token|repo:\/synthetic/);
});

test('survey classifies lifecycle state without probing filesystem paths', () => {
    const report = surveySpokesForRecords([
        row({ slug: 'live', projection_status: 'current' }),
        row({ slug: 'stale', projection_status: 'missing' }),
        row({ slug: 'offline', mount_status: 'disconnected' }),
        row({ slug: 'duplicate', projection_status: 'current' }),
        row({ slug: 'duplicate', repo_id: 'repo:foreign' }),
    ], HUB);
    assert.deepStrictEqual(bucketsBySlug(report).duplicate.sort(), ['duplicate', 'live']);
    assert.strictEqual(report.spokes.find((entry) => entry.slug === 'stale')?.reason, 'projection_not_current');
    assert.strictEqual(report.spokes.find((entry) => entry.slug === 'offline')?.reason, 'mount_not_active');
    assert.strictEqual(report.counts.phantom, 0);
});

test('survey aggregates by hashed repository binding only', () => {
    const report = surveySpokesForRecords([
        row({ slug: 'a', projection_status: 'current' }),
        row({ slug: 'b', repo_id: 'repo:foreign' }),
        row({ slug: 'c', repo_id: 'repo:foreign' }),
    ], HUB);
    assert.deepStrictEqual(Object.values(report.by_repo_id).sort(), [1, 2]);
    for (const key of Object.keys(report.by_repo_id)) assert.match(key, /^[a-f0-9]{64}$/);
});
