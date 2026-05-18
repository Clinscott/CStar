import test from 'node:test';
import assert from 'node:assert';

import {
    surveySpokesForRecords,
    type SpokeSurveyReport,
    type SpokeBucket,
} from '../../../src/node/core/spokes/spoke_doctor.ts';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';

const HUB = 'repo:/home/me/Corvus/CStar';

function row(overrides: Partial<HallMountedSpokeRecord> & { slug: string; root_path: string }): HallMountedSpokeRecord {
    return {
        spoke_id: `spoke:${overrides.slug}`,
        repo_id: overrides.repo_id ?? HUB,
        slug: overrides.slug,
        kind: overrides.kind ?? 'local',
        root_path: overrides.root_path,
        mount_status: overrides.mount_status ?? 'active',
        trust_level: overrides.trust_level ?? 'trusted',
        write_policy: overrides.write_policy ?? 'read_write',
        projection_status: overrides.projection_status ?? 'missing',
        last_scan_at: overrides.last_scan_at,
        last_health_at: overrides.last_health_at,
        metadata: overrides.metadata,
        created_at: overrides.created_at ?? 0,
        updated_at: overrides.updated_at ?? 0,
    } as HallMountedSpokeRecord;
}

function bucketsBySlug(report: SpokeSurveyReport): Record<string, SpokeBucket[]> {
    const out: Record<string, SpokeBucket[]> = {};
    for (const e of report.spokes) {
        (out[e.slug] ??= []).push(e.bucket);
    }
    return out;
}

test('LIVE bucket — current projection on existing hub-owned path', () => {
    const rows: HallMountedSpokeRecord[] = [
        row({
            slug: 'real',
            root_path: process.cwd(),
            projection_status: 'current',
            metadata: { authority: { mount_token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
        }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.counts.live, 1);
    assert.strictEqual(r.counts.phantom, 0);
    assert.strictEqual(r.spokes[0].bucket, 'live');
    assert.strictEqual(r.spokes[0].mount_token, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

test('PHANTOM bucket — /tmp test residue is classified regardless of disk presence', () => {
    const rows: HallMountedSpokeRecord[] = [
        row({ slug: 'astrologer', repo_id: 'repo:/tmp/corvus-ravens-foo', root_path: '/tmp/corvus-ravens-astrologer-zzzz' }),
        row({ slug: 'corvus-p1-source-x', repo_id: 'repo:/tmp/corvus-p1-y', root_path: '/tmp/corvus-p1-topology-zzz/.estate/gallery/x' }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.counts.phantom, 2);
    assert.strictEqual(r.counts.live, 0);
    for (const e of r.spokes) {
        assert.strictEqual(e.bucket, 'phantom');
        assert.match(e.reason, /\/tmp/);
        assert.strictEqual(e.is_tmp_fixture, true);
    }
});

test('PHANTOM bucket — Windows path on Linux', { skip: process.platform === 'win32' }, () => {
    const rows = [row({ slug: 'keepos', repo_id: 'repo:other', root_path: 'C:/Estate/KeepOS' })];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.spokes[0].bucket, 'phantom');
    assert.strictEqual(r.spokes[0].is_platform_mismatch, true);
    assert.match(r.spokes[0].reason, /Windows path/);
});

test('DUPLICATE bucket — same slug under non-hub repo when path exists', () => {
    const rows: HallMountedSpokeRecord[] = [
        row({
            slug: 'dup',
            root_path: process.cwd(),
            projection_status: 'current',
            metadata: { authority: { mount_token: 't' } },
        }),
        row({
            slug: 'dup',
            repo_id: 'repo:/some/other/hub',
            root_path: process.cwd(),
        }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    const byBucket = bucketsBySlug(r);
    assert.deepStrictEqual(byBucket.dup.sort(), ['duplicate', 'live']);
});

test('STALE bucket — exists on disk but no current projection', () => {
    const rows = [
        row({ slug: 'on-hub-no-proj', root_path: process.cwd(), projection_status: 'missing' }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.spokes[0].bucket, 'stale');
    assert.match(r.spokes[0].reason, /no current projection/);
});

test('STALE bucket — foreign repo_id but path exists, no duplicate', () => {
    const rows = [row({ slug: 'foreign-only', repo_id: 'repo:/foreign', root_path: process.cwd() })];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.spokes[0].bucket, 'stale');
    assert.match(r.spokes[0].reason, /foreign repo_id/);
});

test('Survey aggregates counts and by_repo_id correctly', () => {
    const rows: HallMountedSpokeRecord[] = [
        row({ slug: 'a', root_path: process.cwd(), projection_status: 'current', metadata: { authority: { mount_token: 't' } } }),
        row({ slug: 'b', repo_id: 'repo:/tmp/corvus-x', root_path: '/tmp/corvus-x/spoke' }),
        row({ slug: 'c', repo_id: 'repo:/tmp/corvus-x', root_path: '/tmp/corvus-x/other' }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    assert.strictEqual(r.counts.live, 1);
    assert.strictEqual(r.counts.phantom, 2);
    assert.strictEqual(r.by_repo_id[HUB], 1);
    assert.strictEqual(r.by_repo_id['repo:/tmp/corvus-x'], 2);
});

// verifySpoke is integration-tested live (it reads the real Hall via database singleton).
// The pure-function test surface is the surveyor; verifySpoke depends on the live DB.
// See the live verification run after wiring for end-to-end coverage.

test('Mount token surfaces from metadata.authority.mount_token only', () => {
    const rows = [
        row({ slug: 'with-token', root_path: process.cwd(), projection_status: 'current', metadata: { authority: { mount_token: 'live-token' } } }),
        row({ slug: 'no-auth-meta', root_path: process.cwd(), projection_status: 'current', metadata: { other_key: 'value' } }),
    ];
    const r = surveySpokesForRecords(rows, HUB);
    const byPath = new Map(r.spokes.map((s) => [s.slug, s]));
    assert.strictEqual(byPath.get('with-token')?.mount_token, 'live-token');
    assert.strictEqual(byPath.get('no-auth-meta')?.mount_token, null);
    // no-auth-meta has projection_status=current but no token => stale, not live.
    assert.strictEqual(byPath.get('no-auth-meta')?.bucket, 'stale');
});
