import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { PennyOneAdapter } from '../../../../src/node/core/runtime/weaves/pennyone.js';
import { database } from '../../../../src/tools/pennyone/intel/database.js';

describe('PennyOneAdapter Unit Tests', () => {
    afterEach(() => {
        mock.reset();
    });

    it('normalizes Hall authority metadata through the PennyOne runtime weave', async () => {
        mock.method(database, 'reconcileLegacyHallRepositoryAliases', () => 1);
        mock.method(database, 'backfillHallBeadMetadata', () => 3);
        mock.method(database, 'backfillHallPlanningSessionMetadata', () => 2);
        mock.method(database, 'backfillHallSkillProposalMetadata', () => 1);
        mock.method(database, 'backfillHallDocumentMetadata', () => 4);
        const saveReceipt = mock.method(database, 'saveHallDocumentSnapshot', () => ({
            document: {
                path: 'docs/reports/hall/normalize-receipts/123.json',
                document_id: 'doc:normalize:123',
            },
            version: {
                version_id: 'docv:normalize:123',
            },
            changed: true,
        } as unknown as ReturnType<typeof database.saveHallDocumentSnapshot>));

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'normalize',
                    path: '.',
                },
            },
            {
                mission_id: 'MISSION-P1-NORMALIZE',
                bead_id: 'bead:p1-normalize',
                trace_id: 'TRACE-P1-NORMALIZE',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /normalized Hall authority metadata/i);
        assert.equal(result.metadata?.adapter, 'runtime:pennyone-normalize');
        assert.equal(result.metadata?.repository_updates, 1);
        assert.equal(result.metadata?.bead_updates, 3);
        assert.equal(result.metadata?.planning_updates, 2);
        assert.equal(result.metadata?.proposal_updates, 1);
        assert.equal(result.metadata?.document_updates, 4);
        assert.equal(result.metadata?.receipt_document_path, 'docs/reports/hall/normalize-receipts/123.json');
        assert.equal(result.metadata?.receipt_document_id, 'doc:normalize:123');
        assert.equal(result.metadata?.receipt_version_id, 'docv:normalize:123');
        assert.equal(saveReceipt.mock.callCount(), 1);
    });

    it('walks the current estate Hall repositories when normalize is requested with estate scope', async () => {
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'reconcileLegacyHallRepositoryAliases', (rootPath: string) => rootPath === '/tmp/cstar' ? 1 : 0);
        mock.method(database, 'backfillHallBeadMetadata', (rootPath: string) => rootPath === '/tmp/cstar' ? 3 : 2);
        mock.method(database, 'backfillHallPlanningSessionMetadata', (rootPath: string) => rootPath === '/tmp/cstar' ? 2 : 1);
        mock.method(database, 'backfillHallSkillProposalMetadata', (rootPath: string) => rootPath === '/tmp/cstar' ? 1 : 4);
        mock.method(database, 'backfillHallDocumentMetadata', (rootPath: string) => rootPath === '/tmp/cstar' ? 4 : 5);
        const saveReceipt = mock.method(database, 'saveHallDocumentSnapshot', () => ({
            document: {
                path: 'docs/reports/hall/normalize-receipts/456.json',
                document_id: 'doc:normalize:456',
            },
            version: {
                version_id: 'docv:normalize:456',
            },
            changed: true,
        } as unknown as ReturnType<typeof database.saveHallDocumentSnapshot>));

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'normalize',
                    path: '.',
                    estate: true,
                },
            },
            {
                mission_id: 'MISSION-P1-NORMALIZE-ESTATE',
                bead_id: 'bead:p1-normalize-estate',
                trace_id: 'TRACE-P1-NORMALIZE-ESTATE',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /2 root\(s\)/i);
        assert.equal(result.metadata?.estate, true);
        assert.deepStrictEqual(result.metadata?.roots, ['/tmp/cstar', '/tmp/xo']);
        assert.equal(result.metadata?.repository_updates, 1);
        assert.equal(result.metadata?.bead_updates, 5);
        assert.equal(result.metadata?.planning_updates, 3);
        assert.equal(result.metadata?.proposal_updates, 5);
        assert.equal(result.metadata?.document_updates, 9);
        assert.equal(result.metadata?.receipt_document_path, 'docs/reports/hall/normalize-receipts/456.json');
        assert.equal(saveReceipt.mock.callCount(), 1);
    });

    it('reports recent normalize receipts and Hall hygiene across the current estate roots', async () => {
        const now = 1_775_055_500_000;
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/archive' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'getHallSummary', (rootPath: string) => ({
            repo_id: `repo:${rootPath}`,
            root_path: rootPath,
            name: rootPath.split('/').at(-1) ?? rootPath,
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 0,
            intent_integrity: 100,
            open_beads: rootPath === '/tmp/cstar' ? 2 : rootPath === '/tmp/archive' ? 5 : 1,
            validation_runs: rootPath === '/tmp/cstar' ? 4 : rootPath === '/tmp/archive' ? 1 : 3,
        }));
        mock.method(database, 'listHallDocuments', (rootPath: string) => rootPath === '/tmp/cstar'
            ? [{
                path: 'docs/reports/hall/normalize-receipts/1.json',
                doc_kind: 'maintenance',
                updated_at: now,
                latest_summary: 'Normalized CStar',
                metadata: { receipt_kind: 'pennyone-normalize' },
            }]
            : rootPath === '/tmp/archive'
                ? [{
                    path: 'docs/reports/hall/normalize-receipts/old.json',
                    doc_kind: 'maintenance',
                    updated_at: now - (8 * 24 * 60 * 60 * 1000),
                    latest_summary: 'Normalized Archive',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                }]
            : []);
        mock.method(Date, 'now', () => now);
        const saveReport = mock.method(database, 'saveHallDocumentSnapshot', () => ({
            document: {
                path: 'docs/reports/hall/hygiene-reports/1.json',
                document_id: 'doc:report:1',
            },
            version: {
                version_id: 'docv:report:1',
            },
            changed: true,
        } as unknown as ReturnType<typeof database.saveHallDocumentSnapshot>));

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'report',
                    path: '.',
                    estate: true,
                },
            },
            {
                mission_id: 'MISSION-P1-REPORT',
                bead_id: 'bead:p1-report',
                trace_id: 'TRACE-P1-REPORT',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /Hall hygiene report/i);
        assert.equal(result.metadata?.adapter, 'runtime:pennyone-report');
        assert.equal(result.metadata?.estate, true);
        assert.deepStrictEqual(result.metadata?.roots, ['/tmp/cstar', '/tmp/archive', '/tmp/xo']);
        assert.equal(result.metadata?.receipt_count, 2);
        assert.equal(result.metadata?.stale_receipt_count, 1);
        assert.equal(result.metadata?.total_open_beads, 8);
        assert.equal(result.metadata?.total_validation_runs, 8);
        assert.equal(result.metadata?.report_document_path, 'docs/reports/hall/hygiene-reports/1.json');
        assert.equal(result.metadata?.report_document_id, 'doc:report:1');
        assert.equal(result.metadata?.report_version_id, 'docv:report:1');
        assert.equal(saveReport.mock.callCount(), 1);
        assert.deepStrictEqual(result.metadata?.per_root, [
            {
                root_path: '/tmp/xo',
                repo_id: 'repo:/tmp/xo',
                status: 'AWAKE',
                open_beads: 1,
                validation_runs: 3,
                receipt_state: 'missing',
                latest_receipt_path: undefined,
                latest_receipt_summary: undefined,
                latest_receipt_updated_at: undefined,
            },
            {
                root_path: '/tmp/archive',
                repo_id: 'repo:/tmp/archive',
                status: 'AWAKE',
                open_beads: 5,
                validation_runs: 1,
                receipt_state: 'stale',
                latest_receipt_path: 'docs/reports/hall/normalize-receipts/old.json',
                latest_receipt_summary: 'Normalized Archive',
                latest_receipt_updated_at: now - (8 * 24 * 60 * 60 * 1000),
            },
            {
                root_path: '/tmp/cstar',
                repo_id: 'repo:/tmp/cstar',
                status: 'AWAKE',
                open_beads: 2,
                validation_runs: 4,
                receipt_state: 'fresh',
                latest_receipt_path: 'docs/reports/hall/normalize-receipts/1.json',
                latest_receipt_summary: 'Normalized CStar',
                latest_receipt_updated_at: now,
            },
        ]);
        const outputLines = result.output.split('\n');
        assert.match(outputLines[0] ?? '', /1 stale receipt\(s\)/);
        assert.match(outputLines[1] ?? '', /\/tmp\/xo \| status=AWAKE \| receipt_state=missing \| open_beads=1 \| validation_runs=3 \| latest_receipt=none/);
        assert.match(outputLines[2] ?? '', /\/tmp\/archive \| status=AWAKE \| receipt_state=stale \| open_beads=5 \| validation_runs=1 \| latest_receipt=docs\/reports\/hall\/normalize-receipts\/old\.json/);
        assert.match(outputLines[3] ?? '', /\/tmp\/cstar \| status=AWAKE \| receipt_state=fresh \| open_beads=2 \| validation_runs=4 \| latest_receipt=docs\/reports\/hall\/normalize-receipts\/1\.json/);
    });

    it('lists recorded PennyOne maintenance artifacts without recomputing them', async () => {
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'listHallDocuments', (rootPath: string) => rootPath === '/tmp/cstar'
            ? [
                {
                    path: 'docs/reports/hall/hygiene-reports/2.json',
                    doc_kind: 'maintenance',
                    updated_at: 200,
                    latest_summary: 'Reported CStar hygiene',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
                {
                    path: 'docs/reports/hall/normalize-receipts/1.json',
                    doc_kind: 'maintenance',
                    updated_at: 100,
                    latest_summary: 'Normalized CStar',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                },
            ]
            : [
                {
                    path: 'docs/reports/hall/normalize-receipts/3.json',
                    doc_kind: 'maintenance',
                    updated_at: 150,
                    latest_summary: 'Normalized XO',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                },
            ]);

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'artifacts',
                    path: '.',
                    estate: true,
                },
            },
            {
                mission_id: 'MISSION-P1-ARTIFACTS',
                bead_id: 'bead:p1-artifacts',
                trace_id: 'TRACE-P1-ARTIFACTS',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.adapter, 'runtime:pennyone-artifacts');
        assert.equal(result.metadata?.estate, true);
        assert.deepStrictEqual(result.metadata?.roots, ['/tmp/cstar', '/tmp/xo']);
        assert.equal(result.metadata?.artifact_count, 3);
        assert.deepStrictEqual(result.metadata?.per_root, [
            {
                root_path: '/tmp/cstar',
                artifact_count: 2,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/2.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: 200,
                        summary: 'Reported CStar hygiene',
                    },
                    {
                        path: 'docs/reports/hall/normalize-receipts/1.json',
                        artifact_kind: 'normalize_receipt',
                        updated_at: 100,
                        summary: 'Normalized CStar',
                    },
                ],
            },
            {
                root_path: '/tmp/xo',
                artifact_count: 1,
                artifacts: [
                    {
                        path: 'docs/reports/hall/normalize-receipts/3.json',
                        artifact_kind: 'normalize_receipt',
                        updated_at: 150,
                        summary: 'Normalized XO',
                    },
                ],
            },
        ]);
        const outputLines = result.output.split('\n');
        assert.match(outputLines[0] ?? '', /PennyOne maintenance artifacts \(2 root\(s\), 3 artifact\(s\)\)/);
        assert.match(outputLines[1] ?? '', /\/tmp\/cstar \| artifacts=2/);
        assert.match(outputLines[2] ?? '', /hygiene_report \| docs\/reports\/hall\/hygiene-reports\/2\.json \| updated_at=200 \| summary=Reported CStar hygiene/);
        assert.match(outputLines[3] ?? '', /normalize_receipt \| docs\/reports\/hall\/normalize-receipts\/1\.json \| updated_at=100 \| summary=Normalized CStar/);
        assert.match(outputLines[4] ?? '', /\/tmp\/xo \| artifacts=1/);
        assert.match(outputLines[5] ?? '', /normalize_receipt \| docs\/reports\/hall\/normalize-receipts\/3\.json \| updated_at=150 \| summary=Normalized XO/);
    });

    it('filters and limits PennyOne maintenance artifacts per root', async () => {
        mock.method(Date, 'now', () => 1_000);
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'listHallDocuments', (rootPath: string) => rootPath === '/tmp/cstar'
            ? [
                {
                    path: 'docs/reports/hall/hygiene-reports/9.json',
                    doc_kind: 'maintenance',
                    updated_at: 300,
                    latest_summary: 'Reported CStar hygiene newest',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
                {
                    path: 'docs/reports/hall/hygiene-reports/8.json',
                    doc_kind: 'maintenance',
                    updated_at: 200,
                    latest_summary: 'Reported CStar hygiene older',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
                {
                    path: 'docs/reports/hall/normalize-receipts/1.json',
                    doc_kind: 'maintenance',
                    updated_at: 100,
                    latest_summary: 'Normalized CStar',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                },
            ]
            : [
                {
                    path: 'docs/reports/hall/hygiene-reports/7.json',
                    doc_kind: 'maintenance',
                    updated_at: 150,
                    latest_summary: 'Reported XO hygiene',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
            ]);

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'artifacts',
                    path: '.',
                    estate: true,
                    artifact_kind: 'report',
                    limit: 1,
                    since: '24h',
                },
            },
            {
                mission_id: 'MISSION-P1-ARTIFACTS-FILTER',
                bead_id: 'bead:p1-artifacts-filter',
                trace_id: 'TRACE-P1-ARTIFACTS-FILTER',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.adapter, 'runtime:pennyone-artifacts');
        assert.equal(result.metadata?.artifact_kind, 'report');
        assert.equal(result.metadata?.limit, 1);
        assert.equal(result.metadata?.since, '24h');
        assert.equal(result.metadata?.artifact_count, 2);
        assert.deepStrictEqual(result.metadata?.per_root, [
            {
                root_path: '/tmp/cstar',
                artifact_count: 1,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/9.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: 300,
                        summary: 'Reported CStar hygiene newest',
                    },
                ],
            },
            {
                root_path: '/tmp/xo',
                artifact_count: 1,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/7.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: 150,
                        summary: 'Reported XO hygiene',
                    },
                ],
            },
        ]);
        const outputLines = result.output.split('\n');
        assert.match(outputLines[0] ?? '', /PennyOne maintenance artifacts \(2 root\(s\), 2 artifact\(s\), kind=report, limit=1, since=24h\)/);
        assert.match(outputLines[1] ?? '', /\/tmp\/cstar \| artifacts=1/);
        assert.match(outputLines[2] ?? '', /hygiene_report \| docs\/reports\/hall\/hygiene-reports\/9\.json \| updated_at=300 \| summary=Reported CStar hygiene newest/);
        assert.match(outputLines[3] ?? '', /\/tmp\/xo \| artifacts=1/);
        assert.match(outputLines[4] ?? '', /hygiene_report \| docs\/reports\/hall\/hygiene-reports\/7\.json \| updated_at=150 \| summary=Reported XO hygiene/);
    });

    it('returns combined PennyOne maintenance status in one result', async () => {
        const now = 1_775_055_900_000;
        mock.method(Date, 'now', () => now);
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'getHallSummary', (rootPath: string) => ({
            repo_id: `repo:${rootPath}`,
            root_path: rootPath,
            name: rootPath.split('/').at(-1) ?? rootPath,
            status: rootPath === '/tmp/cstar' ? 'AGENT_LOOP' : 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 0,
            intent_integrity: 100,
            open_beads: rootPath === '/tmp/cstar' ? 3 : 0,
            validation_runs: rootPath === '/tmp/cstar' ? 2 : 5,
        }));
        mock.method(database, 'listHallDocuments', (rootPath: string) => rootPath === '/tmp/cstar'
            ? [
                {
                    path: 'docs/reports/hall/hygiene-reports/2.json',
                    doc_kind: 'maintenance',
                    updated_at: now - 1000,
                    latest_summary: 'Reported CStar hygiene',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
                {
                    path: 'docs/reports/hall/normalize-receipts/1.json',
                    doc_kind: 'maintenance',
                    updated_at: now - 2000,
                    latest_summary: 'Normalized CStar',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                },
            ]
            : []);
        const saveStatus = mock.method(database, 'saveHallDocumentSnapshot', () => ({
            document: {
                path: 'docs/reports/hall/status-reports/1.json',
                document_id: 'doc:status:1',
            },
            version: {
                version_id: 'docv:status:1',
            },
            changed: true,
        } as unknown as ReturnType<typeof database.saveHallDocumentSnapshot>));

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'status',
                    path: '.',
                    estate: true,
                    artifact_kind: 'maintenance',
                    since: '30d',
                },
            },
            {
                mission_id: 'MISSION-P1-STATUS',
                bead_id: 'bead:p1-status',
                trace_id: 'TRACE-P1-STATUS',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.adapter, 'runtime:pennyone-status');
        assert.equal(result.metadata?.receipt_count, 1);
        assert.equal(result.metadata?.report_count, 1);
        assert.equal(result.metadata?.artifact_count, 2);
        assert.equal(result.metadata?.stale_receipt_count, 0);
        assert.equal(result.metadata?.total_open_beads, 3);
        assert.equal(result.metadata?.total_validation_runs, 7);
        assert.equal(result.metadata?.status_document_path, 'docs/reports/hall/status-reports/1.json');
        assert.equal(result.metadata?.status_document_id, 'doc:status:1');
        assert.equal(result.metadata?.status_version_id, 'docv:status:1');
        assert.equal(saveStatus.mock.callCount(), 1);
        assert.deepStrictEqual(result.metadata?.per_root, [
            {
                root_path: '/tmp/xo',
                repo_id: 'repo:/tmp/xo',
                status: 'AWAKE',
                open_beads: 0,
                validation_runs: 5,
                receipt_state: 'missing',
                latest_receipt_path: undefined,
                latest_receipt_summary: undefined,
                latest_receipt_updated_at: undefined,
                latest_report_path: undefined,
                latest_report_summary: undefined,
                latest_report_updated_at: undefined,
                artifact_count: 0,
                artifacts: [],
            },
            {
                root_path: '/tmp/cstar',
                repo_id: 'repo:/tmp/cstar',
                status: 'AGENT_LOOP',
                open_beads: 3,
                validation_runs: 2,
                receipt_state: 'fresh',
                latest_receipt_path: 'docs/reports/hall/normalize-receipts/1.json',
                latest_receipt_summary: 'Normalized CStar',
                latest_receipt_updated_at: now - 2000,
                latest_report_path: 'docs/reports/hall/hygiene-reports/2.json',
                latest_report_summary: 'Reported CStar hygiene',
                latest_report_updated_at: now - 1000,
                artifact_count: 2,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/2.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: now - 1000,
                        summary: 'Reported CStar hygiene',
                    },
                    {
                        path: 'docs/reports/hall/normalize-receipts/1.json',
                        artifact_kind: 'normalize_receipt',
                        updated_at: now - 2000,
                        summary: 'Normalized CStar',
                    },
                ],
            },
        ]);
        const outputLines = result.output.split('\n');
        assert.match(outputLines[0] ?? '', /PennyOne Hall maintenance status \(2 root\(s\), 1 normalize receipt\(s\), 1 hygiene report\(s\), 0 stale receipt\(s\), 2 maintenance artifact\(s\), 3 open bead\(s\), 7 validation run\(s\)\)/);
        assert.match(outputLines[1] ?? '', /\/tmp\/xo \| status=AWAKE \| receipt_state=missing \| latest_receipt=none \| latest_report=none \| artifacts=0/);
        assert.match(outputLines[2] ?? '', /\/tmp\/cstar \| status=AGENT_LOOP \| receipt_state=fresh \| latest_receipt=docs\/reports\/hall\/normalize-receipts\/1\.json \| latest_report=docs\/reports\/hall\/hygiene-reports\/2\.json \| artifacts=2/);
    });

    it('filters PennyOne maintenance artifacts by absolute since date', async () => {
        mock.method(database, 'listHallRepositories', () => ([
            { root_path: '/tmp/cstar' },
            { root_path: '/tmp/xo' },
        ] as Array<{ root_path: string }>));
        mock.method(database, 'listHallDocuments', (rootPath: string) => rootPath === '/tmp/cstar'
            ? [
                {
                    path: 'docs/reports/hall/hygiene-reports/9.json',
                    doc_kind: 'maintenance',
                    updated_at: Date.UTC(2026, 2, 5, 10, 0, 0),
                    latest_summary: 'Reported CStar hygiene newest',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
                {
                    path: 'docs/reports/hall/normalize-receipts/1.json',
                    doc_kind: 'maintenance',
                    updated_at: Date.UTC(2026, 1, 28, 23, 59, 59),
                    latest_summary: 'Normalized CStar before cutoff',
                    metadata: { receipt_kind: 'pennyone-normalize' },
                },
            ]
            : [
                {
                    path: 'docs/reports/hall/hygiene-reports/7.json',
                    doc_kind: 'maintenance',
                    updated_at: Date.UTC(2026, 2, 1, 0, 0, 0),
                    latest_summary: 'Reported XO hygiene at cutoff',
                    metadata: { report_kind: 'pennyone-hall-hygiene' },
                },
            ]);

        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'artifacts',
                    path: '.',
                    estate: true,
                    artifact_kind: 'maintenance',
                    since_date: '2026-03-01',
                },
            },
            {
                mission_id: 'MISSION-P1-ARTIFACTS-SINCE-DATE',
                bead_id: 'bead:p1-artifacts-since-date',
                trace_id: 'TRACE-P1-ARTIFACTS-SINCE-DATE',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.since_date, '2026-03-01');
        assert.equal(result.metadata?.artifact_count, 2);
        assert.deepStrictEqual(result.metadata?.per_root, [
            {
                root_path: '/tmp/cstar',
                artifact_count: 1,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/9.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: Date.UTC(2026, 2, 5, 10, 0, 0),
                        summary: 'Reported CStar hygiene newest',
                    },
                ],
            },
            {
                root_path: '/tmp/xo',
                artifact_count: 1,
                artifacts: [
                    {
                        path: 'docs/reports/hall/hygiene-reports/7.json',
                        artifact_kind: 'hygiene_report',
                        updated_at: Date.UTC(2026, 2, 1, 0, 0, 0),
                        summary: 'Reported XO hygiene at cutoff',
                    },
                ],
            },
        ]);
        assert.match(result.output.split('\n')[0] ?? '', /since_date=2026-03-01/);
    });

    it('rejects unsupported PennyOne artifact since windows', async () => {
        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'artifacts',
                    path: '.',
                    since: 'tomorrow',
                },
            },
            {
                mission_id: 'MISSION-P1-ARTIFACTS-SINCE-FAIL',
                bead_id: 'bead:p1-artifacts-since-fail',
                trace_id: 'TRACE-P1-ARTIFACTS-SINCE-FAIL',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Unsupported PennyOne since window 'tomorrow'/);
    });

    it('rejects invalid PennyOne absolute since dates', async () => {
        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'status',
                    path: '.',
                    since_date: '2026-02-30',
                },
            },
            {
                mission_id: 'MISSION-P1-STATUS-SINCE-DATE-FAIL',
                bead_id: 'bead:p1-status-since-date-fail',
                trace_id: 'TRACE-P1-STATUS-SINCE-DATE-FAIL',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Unsupported PennyOne since date '2026-02-30'/);
    });

    it('rejects mixed PennyOne since window and since date filters', async () => {
        const adapter = new PennyOneAdapter();
        const result = await adapter.execute(
            {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'artifacts',
                    path: '.',
                    since: '7d',
                    since_date: '2026-03-01',
                },
            },
            {
                mission_id: 'MISSION-P1-ARTIFACTS-SINCE-CONFLICT',
                bead_id: 'bead:p1-artifacts-since-conflict',
                trace_id: 'TRACE-P1-ARTIFACTS-SINCE-CONFLICT',
                persona: 'ALFRED',
                workspace_root: '/tmp/cstar',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /either --since or --since-date, not both/);
    });
});
