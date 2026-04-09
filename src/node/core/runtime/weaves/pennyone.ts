import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';

import { refreshOfflineIntents, runScan } from  '../../../../tools/pennyone/index.js';
import { buildEstateTopology, writeProjectedMatrixGraph } from  '../../../../tools/pennyone/intel/compiler.js';
import { database } from  '../../../../tools/pennyone/intel/database.js';
import { importRepositoryIntoEstate } from  '../../../../tools/pennyone/intel/importer.js';
import { searchMatrix } from  '../../../../tools/pennyone/live/search.js';
import { registry } from  '../../../../tools/pennyone/pathRegistry.js';
import { resolveTargetPath } from  '../adapters/ravens_utils.js';
import {
    PennyOneWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

const NORMALIZE_RECEIPT_STALE_MS = 7 * 24 * 60 * 60 * 1000;
type ReceiptState = 'missing' | 'stale' | 'fresh';

function buildNormalizeReceiptPath(createdAt: number): string {
    return `docs/reports/hall/normalize-receipts/${createdAt}.json`;
}

function buildReportReceiptPath(createdAt: number): string {
    return `docs/reports/hall/hygiene-reports/${createdAt}.json`;
}

function buildStatusReceiptPath(createdAt: number): string {
    return `docs/reports/hall/status-reports/${createdAt}.json`;
}

function classifyMaintenanceArtifact(document: { metadata?: Record<string, unknown> }): 'normalize_receipt' | 'hygiene_report' | 'maintenance_document' {
    if (document.metadata?.receipt_kind === 'pennyone-normalize') {
        return 'normalize_receipt';
    }
    if (document.metadata?.report_kind === 'pennyone-hall-hygiene') {
        return 'hygiene_report';
    }
    return 'maintenance_document';
}

function matchesArtifactKind(
    document: { metadata?: Record<string, unknown> },
    artifactKind: PennyOneWeavePayload['artifact_kind'],
): boolean {
    if (!artifactKind || artifactKind === 'maintenance') {
        return true;
    }

    if (artifactKind === 'normalize') {
        return document.metadata?.receipt_kind === 'pennyone-normalize';
    }

    if (artifactKind === 'report') {
        return document.metadata?.report_kind === 'pennyone-hall-hygiene';
    }

    return false;
}

function parseSinceWindow(raw: string | undefined, now: number): number | undefined {
    if (!raw?.trim()) {
        return undefined;
    }

    const normalized = raw.trim().toLowerCase();
    const match = normalized.match(/^(\d+)([mhdw])$/);
    if (!match) {
        throw new Error(`Unsupported PennyOne since window '${raw}'. Use <number><m|h|d|w>, for example 30m, 24h, or 7d.`);
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
    };

    return now - (value * multipliers[unit]);
}

function parseSinceDate(raw: string | undefined): number | undefined {
    if (!raw?.trim()) {
        return undefined;
    }

    const normalized = raw.trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        throw new Error(`Unsupported PennyOne since date '${raw}'. Use YYYY-MM-DD, for example 2026-03-01.`);
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);

    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw new Error(`Unsupported PennyOne since date '${raw}'. Use a real calendar date in YYYY-MM-DD form.`);
    }

    return timestamp;
}

function resolveSinceCutoff(input: { since?: string; since_date?: string }, now: number): number | undefined {
    if (input.since && input.since_date) {
        throw new Error('PennyOne supports either --since or --since-date, not both in the same command.');
    }

    if (input.since_date) {
        return parseSinceDate(input.since_date);
    }

    return parseSinceWindow(input.since, now);
}

function buildNormalizeReceiptContent(input: {
    created_at: number;
    estate: boolean;
    roots: string[];
    per_root: Array<Record<string, unknown>>;
    repository_updates: number;
    bead_updates: number;
    planning_updates: number;
    proposal_updates: number;
    document_updates: number;
}): string {
    return JSON.stringify({
        receipt_kind: 'pennyone-normalize',
        created_at: input.created_at,
        estate: input.estate,
        roots: input.roots,
        totals: {
            repository_updates: input.repository_updates,
            bead_updates: input.bead_updates,
            planning_updates: input.planning_updates,
            proposal_updates: input.proposal_updates,
            document_updates: input.document_updates,
        },
        per_root: input.per_root,
    }, null, 2);
}

function formatPennyOneReportOutput(input: {
    roots: string[];
    receipt_count: number;
    stale_receipt_count: number;
    total_open_beads: number;
    total_validation_runs: number;
    per_root: Array<{
        root_path: string;
        status: string;
        open_beads: number;
        validation_runs: number;
        receipt_state: 'missing' | 'stale' | 'fresh';
        latest_receipt_path?: string;
    }>;
}): string {
    const header = `PennyOne Hall hygiene report (${input.roots.length} root(s), ${input.receipt_count} root(s) with normalize receipts, ${input.stale_receipt_count} stale receipt(s), ${input.total_open_beads} open bead(s), ${input.total_validation_runs} validation run(s)).`;
    const lines = input.per_root.map((entry) => {
        const receipt = entry.latest_receipt_path ?? 'none';
        return `${entry.root_path} | status=${entry.status} | receipt_state=${entry.receipt_state} | open_beads=${entry.open_beads} | validation_runs=${entry.validation_runs} | latest_receipt=${receipt}`;
    });
    return [header, ...lines].join('\n');
}

function buildPennyOneReportContent(input: {
    reported_at: number;
    estate: boolean;
    roots: string[];
    receipt_count: number;
    stale_receipt_count: number;
    total_open_beads: number;
    total_validation_runs: number;
    per_root: Array<Record<string, unknown>>;
}): string {
    return JSON.stringify({
        report_kind: 'pennyone-hall-hygiene',
        reported_at: input.reported_at,
        estate: input.estate,
        roots: input.roots,
        totals: {
            receipt_count: input.receipt_count,
            stale_receipt_count: input.stale_receipt_count,
            total_open_beads: input.total_open_beads,
            total_validation_runs: input.total_validation_runs,
        },
        per_root: input.per_root,
    }, null, 2);
}

function formatPennyOneArtifactsOutput(input: {
    roots: string[];
    artifact_count: number;
    artifact_kind?: PennyOneWeavePayload['artifact_kind'];
    limit?: number;
    since?: string;
    since_date?: string;
    per_root: Array<{
        root_path: string;
        artifact_count: number;
        artifacts: Array<{
            path: string;
            artifact_kind: string;
            updated_at: number;
            summary?: string;
        }>;
    }>;
}): string {
    const qualifiers = [
        input.artifact_kind ? `kind=${input.artifact_kind}` : undefined,
        typeof input.limit === 'number' ? `limit=${input.limit}` : undefined,
        input.since ? `since=${input.since}` : undefined,
        input.since_date ? `since_date=${input.since_date}` : undefined,
    ].filter(Boolean).join(', ');
    const header = `PennyOne maintenance artifacts (${input.roots.length} root(s), ${input.artifact_count} artifact(s)${qualifiers ? `, ${qualifiers}` : ''}).`;
    const lines: string[] = [header];

    for (const root of input.per_root) {
        lines.push(`${root.root_path} | artifacts=${root.artifact_count}`);
        for (const artifact of root.artifacts) {
            lines.push(`  ${artifact.artifact_kind} | ${artifact.path} | updated_at=${artifact.updated_at} | summary=${artifact.summary ?? '...'}`);
        }
    }

    return lines.join('\n');
}

function resolvePennyOneRoots(baseRoot: string, estate: boolean | undefined): string[] {
    return estate
        ? Array.from(new Set([
            baseRoot,
            ...database.listHallRepositories(baseRoot)
                .map((entry) => entry.root_path)
                .filter((rootPath) => rootPath.startsWith('/')),
        ]))
        : [baseRoot];
}

function formatPennyOneStatusOutput(input: {
    roots: string[];
    receipt_count: number;
    stale_receipt_count: number;
    report_count: number;
    artifact_count: number;
    total_open_beads: number;
    total_validation_runs: number;
    per_root: Array<{
        root_path: string;
        status: string;
        receipt_state: 'missing' | 'stale' | 'fresh';
        latest_receipt_path?: string;
        latest_report_path?: string;
        artifact_count: number;
    }>;
}): string {
    const header = `PennyOne Hall maintenance status (${input.roots.length} root(s), ${input.receipt_count} normalize receipt(s), ${input.report_count} hygiene report(s), ${input.stale_receipt_count} stale receipt(s), ${input.artifact_count} maintenance artifact(s), ${input.total_open_beads} open bead(s), ${input.total_validation_runs} validation run(s)).`;
    const lines = input.per_root.map((entry) =>
        `${entry.root_path} | status=${entry.status} | receipt_state=${entry.receipt_state} | latest_receipt=${entry.latest_receipt_path ?? 'none'} | latest_report=${entry.latest_report_path ?? 'none'} | artifacts=${entry.artifact_count}`
    );
    return [header, ...lines].join('\n');
}

function buildPennyOneStatusContent(input: {
    reported_at: number;
    estate: boolean;
    roots: string[];
    artifact_kind?: PennyOneWeavePayload['artifact_kind'];
    since?: string;
    since_date?: string;
    receipt_count: number;
    stale_receipt_count: number;
    report_count: number;
    artifact_count: number;
    total_open_beads: number;
    total_validation_runs: number;
    per_root: Array<Record<string, unknown>>;
}): string {
    return JSON.stringify({
        status_kind: 'pennyone-maintenance-status',
        reported_at: input.reported_at,
        estate: input.estate,
        roots: input.roots,
        artifact_kind: input.artifact_kind,
        since: input.since,
        since_date: input.since_date,
        totals: {
            receipt_count: input.receipt_count,
            stale_receipt_count: input.stale_receipt_count,
            report_count: input.report_count,
            artifact_count: input.artifact_count,
            total_open_beads: input.total_open_beads,
            total_validation_runs: input.total_validation_runs,
        },
        per_root: input.per_root,
    }, null, 2);
}

export class PennyOneAdapter implements RuntimeAdapter<PennyOneWeavePayload> {
    public readonly id = 'weave:pennyone';

    public async execute(
        invocation: WeaveInvocation<PennyOneWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const projectRoot = context.workspace_root;
        const payload = invocation.payload;

        if (payload.action === 'import') {
            if (!payload.remote_url) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: 'PennyOne import requires a git source or local repository path.',
                };
            }

            const mounted = await importRepositoryIntoEstate(payload.remote_url, {
                slug: payload.slug,
                workspaceRoot: registry.getRoot(),
            });
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `PennyOne imported and projected '${mounted.slug}' into the estate gallery.`,
                metadata: {
                    adapter: 'runtime:pennyone-estate-import',
                    mounted_spoke: mounted,
                },
            };
        }

        if (payload.action === 'topology') {
            const topology = buildEstateTopology(registry.getRoot());
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `PennyOne topology projected for ${topology.nodes.length} node(s).`,
                metadata: {
                    adapter: 'runtime:pennyone-topology',
                    topology,
                },
            };
        }

        if (payload.action === 'search') {
            if (!payload.query) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: 'PennyOne search requires a query.',
                };
            }

            await searchMatrix(payload.query, resolveTargetPath(projectRoot, payload.path));
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `PennyOne search completed for "${payload.query}".`,
                metadata: { adapter: 'legacy:pennyone', action: payload.action },
            };
        }

        if (payload.action === 'refresh_intents') {
            const refreshPath = resolveTargetPath(projectRoot, payload.path);
            const result = await refreshOfflineIntents(refreshPath);
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `PennyOne refreshed ${result.refreshed}/${result.total_candidates} offline semantic intent record(s).`,
                metadata: {
                    adapter: 'runtime:pennyone-refresh-intents',
                    action: payload.action,
                    ...result,
                },
            };
        }

        if (payload.action === 'normalize') {
            const normalizeRoot = resolveTargetPath(projectRoot, payload.path);
            const created_at = Date.now();
            const roots = resolvePennyOneRoots(normalizeRoot, payload.estate);
            const per_root = roots.map((rootPath) => ({
                root_path: rootPath,
                repository_updates: database.reconcileLegacyHallRepositoryAliases(rootPath),
                bead_updates: database.backfillHallBeadMetadata(rootPath),
                planning_updates: database.backfillHallPlanningSessionMetadata(rootPath),
                proposal_updates: database.backfillHallSkillProposalMetadata(rootPath),
                document_updates: database.backfillHallDocumentMetadata(rootPath),
            }));
            const repository_updates = per_root.reduce((sum, entry) => sum + entry.repository_updates, 0);
            const bead_updates = per_root.reduce((sum, entry) => sum + entry.bead_updates, 0);
            const planning_updates = per_root.reduce((sum, entry) => sum + entry.planning_updates, 0);
            const proposal_updates = per_root.reduce((sum, entry) => sum + entry.proposal_updates, 0);
            const document_updates = per_root.reduce((sum, entry) => sum + entry.document_updates, 0);
            const receipt_path = buildNormalizeReceiptPath(created_at);
            const receipt = database.saveHallDocumentSnapshot({
                root_path: normalizeRoot,
                document_path: receipt_path,
                content: buildNormalizeReceiptContent({
                    created_at,
                    estate: payload.estate ?? false,
                    roots,
                    per_root,
                    repository_updates,
                    bead_updates,
                    planning_updates,
                    proposal_updates,
                    document_updates,
                }),
                title: 'PennyOne Normalize Receipt',
                summary: `Normalized ${roots.length} root(s) with ${repository_updates} repository alias update(s), ${bead_updates} bead update(s), ${planning_updates} planning update(s), ${proposal_updates} proposal update(s), and ${document_updates} document update(s).`,
                doc_kind: 'maintenance',
                source_label: 'pennyone-normalize',
                metadata: {
                    source: 'pennyone-normalize',
                    receipt_kind: 'pennyone-normalize',
                    estate: payload.estate ?? false,
                    roots,
                },
                created_at,
            });
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `PennyOne normalized Hall authority metadata (${roots.length} root(s), ${repository_updates} repository alias(es), ${bead_updates} bead(s), ${planning_updates} planning session(s), ${proposal_updates} proposal(s), ${document_updates} document(s)).`,
                metadata: {
                    adapter: 'runtime:pennyone-normalize',
                    action: payload.action,
                    estate: payload.estate ?? false,
                    roots,
                    per_root,
                    repository_updates,
                    bead_updates,
                    planning_updates,
                    proposal_updates,
                    document_updates,
                    receipt_document_path: receipt.document.path,
                    receipt_document_id: receipt.document.document_id,
                    receipt_version_id: receipt.version.version_id,
                },
            };
        }

        if (payload.action === 'report') {
            const reportRoot = resolveTargetPath(projectRoot, payload.path);
            const reported_at = Date.now();
            const roots = resolvePennyOneRoots(reportRoot, payload.estate);
            const per_root = roots.map((rootPath) => {
                const summary = database.getHallSummary(rootPath);
                const latest_receipt = database.listHallDocuments(rootPath)
                    .filter((document) => document.doc_kind === 'maintenance' && document.metadata?.receipt_kind === 'pennyone-normalize')
                    .sort((a, b) => b.updated_at - a.updated_at)[0];
                const receipt_state: ReceiptState = !latest_receipt
                    ? 'missing'
                    : (reported_at - Number(latest_receipt.updated_at ?? 0) > NORMALIZE_RECEIPT_STALE_MS ? 'stale' : 'fresh');
                return {
                    root_path: rootPath,
                    repo_id: summary?.repo_id,
                    status: summary?.status ?? 'DORMANT',
                    open_beads: summary?.open_beads ?? 0,
                    validation_runs: summary?.validation_runs ?? 0,
                    receipt_state,
                    latest_receipt_path: latest_receipt?.path,
                    latest_receipt_summary: latest_receipt?.latest_summary,
                    latest_receipt_updated_at: latest_receipt?.updated_at,
                };
            }).sort((left, right) => {
                const priority = { missing: 2, stale: 1, fresh: 0 } as const;
                if (priority[left.receipt_state] !== priority[right.receipt_state]) {
                    return priority[right.receipt_state] - priority[left.receipt_state];
                }
                if (left.open_beads !== right.open_beads) {
                    return right.open_beads - left.open_beads;
                }
                if (left.validation_runs !== right.validation_runs) {
                    return right.validation_runs - left.validation_runs;
                }
                return left.root_path.localeCompare(right.root_path);
            });
            const receipt_count = per_root.filter((entry) => entry.latest_receipt_path).length;
            const stale_receipt_count = per_root.filter((entry) => entry.receipt_state === 'stale').length;
            const total_open_beads = per_root.reduce((sum, entry) => sum + Number(entry.open_beads ?? 0), 0);
            const total_validation_runs = per_root.reduce((sum, entry) => sum + Number(entry.validation_runs ?? 0), 0);
            const report_path = buildReportReceiptPath(reported_at);
            const reportReceipt = database.saveHallDocumentSnapshot({
                root_path: reportRoot,
                document_path: report_path,
                content: buildPennyOneReportContent({
                    reported_at,
                    estate: payload.estate ?? false,
                    roots,
                    receipt_count,
                    stale_receipt_count,
                    total_open_beads,
                    total_validation_runs,
                    per_root,
                }),
                title: 'PennyOne Hall Hygiene Report',
                summary: `Reported ${roots.length} root(s) with ${receipt_count} normalize receipt(s), ${stale_receipt_count} stale receipt(s), ${total_open_beads} open bead(s), and ${total_validation_runs} validation run(s).`,
                doc_kind: 'maintenance',
                source_label: 'pennyone-report',
                metadata: {
                    source: 'pennyone-report',
                    report_kind: 'pennyone-hall-hygiene',
                    estate: payload.estate ?? false,
                    roots,
                },
                created_at: reported_at,
            });
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: formatPennyOneReportOutput({
                    roots,
                    receipt_count,
                    stale_receipt_count,
                    total_open_beads,
                    total_validation_runs,
                    per_root,
                }),
                metadata: {
                    adapter: 'runtime:pennyone-report',
                    action: payload.action,
                    estate: payload.estate ?? false,
                    roots,
                    per_root,
                    receipt_count,
                    stale_receipt_count,
                    total_open_beads,
                    total_validation_runs,
                    report_document_path: reportReceipt.document.path,
                    report_document_id: reportReceipt.document.document_id,
                    report_version_id: reportReceipt.version.version_id,
                },
            };
        }

        if (payload.action === 'artifacts') {
            const artifactsRoot = resolveTargetPath(projectRoot, payload.path);
            const artifactKind = payload.artifact_kind;
            const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit)
                ? Math.max(1, Math.floor(payload.limit))
                : undefined;
            const now = Date.now();
            let sinceCutoff: number | undefined;
            try {
                sinceCutoff = resolveSinceCutoff(payload, now);
            } catch (error: any) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: error.message,
                };
            }
            if (artifactKind && !['normalize', 'report', 'maintenance'].includes(artifactKind)) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `Unsupported PennyOne artifact kind '${artifactKind}'. Use normalize, report, or maintenance.`,
                };
            }
            const roots = resolvePennyOneRoots(artifactsRoot, payload.estate);
            const per_root = roots.map((rootPath) => {
                const artifacts = database.listHallDocuments(rootPath)
                    .filter((document) => document.doc_kind === 'maintenance')
                    .filter((document) => matchesArtifactKind(document, artifactKind))
                    .filter((document) => sinceCutoff === undefined || document.updated_at >= sinceCutoff)
                    .sort((left, right) => right.updated_at - left.updated_at)
                    .map((document) => ({
                        path: document.path,
                        artifact_kind: classifyMaintenanceArtifact(document),
                        updated_at: document.updated_at,
                        summary: document.latest_summary,
                    }))
                    .slice(0, limit);
                return {
                    root_path: rootPath,
                    artifact_count: artifacts.length,
                    artifacts,
                };
            }).sort((left, right) => {
                if (left.artifact_count !== right.artifact_count) {
                    return right.artifact_count - left.artifact_count;
                }
                return left.root_path.localeCompare(right.root_path);
            });
            const artifact_count = per_root.reduce((sum, entry) => sum + entry.artifact_count, 0);

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: formatPennyOneArtifactsOutput({
                    roots,
                    artifact_count,
                    artifact_kind: artifactKind,
                    limit,
                    since: payload.since,
                    since_date: payload.since_date,
                    per_root,
                }),
                metadata: {
                    adapter: 'runtime:pennyone-artifacts',
                    action: payload.action,
                    estate: payload.estate ?? false,
                    artifact_kind: artifactKind,
                    limit,
                    since: payload.since,
                    since_date: payload.since_date,
                    roots,
                    per_root,
                    artifact_count,
                },
            };
        }

        if (payload.action === 'status') {
            const statusRoot = resolveTargetPath(projectRoot, payload.path);
            const now = Date.now();
            const roots = resolvePennyOneRoots(statusRoot, payload.estate);
            const artifactKind = payload.artifact_kind;
            const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit)
                ? Math.max(1, Math.floor(payload.limit))
                : undefined;
            let sinceCutoff: number | undefined;
            try {
                sinceCutoff = resolveSinceCutoff(payload, now);
            } catch (error: any) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: error.message,
                };
            }
            const per_root = roots.map((rootPath) => {
                const summary = database.getHallSummary(rootPath);
                const documents = database.listHallDocuments(rootPath)
                    .filter((document) => document.doc_kind === 'maintenance')
                    .sort((left, right) => right.updated_at - left.updated_at);
                const latestReceipt = documents.find((document) => document.metadata?.receipt_kind === 'pennyone-normalize');
                const latestReport = documents.find((document) => document.metadata?.report_kind === 'pennyone-hall-hygiene');
                const receipt_state: ReceiptState = !latestReceipt
                    ? 'missing'
                    : (now - Number(latestReceipt.updated_at ?? 0) > NORMALIZE_RECEIPT_STALE_MS ? 'stale' : 'fresh');
                const artifacts = documents
                    .filter((document) => matchesArtifactKind(document, artifactKind))
                    .filter((document) => sinceCutoff === undefined || document.updated_at >= sinceCutoff)
                    .map((document) => ({
                        path: document.path,
                        artifact_kind: classifyMaintenanceArtifact(document),
                        updated_at: document.updated_at,
                        summary: document.latest_summary,
                    }))
                    .slice(0, limit);
                return {
                    root_path: rootPath,
                    repo_id: summary?.repo_id,
                    status: summary?.status ?? 'DORMANT',
                    open_beads: summary?.open_beads ?? 0,
                    validation_runs: summary?.validation_runs ?? 0,
                    receipt_state,
                    latest_receipt_path: latestReceipt?.path,
                    latest_receipt_summary: latestReceipt?.latest_summary,
                    latest_receipt_updated_at: latestReceipt?.updated_at,
                    latest_report_path: latestReport?.path,
                    latest_report_summary: latestReport?.latest_summary,
                    latest_report_updated_at: latestReport?.updated_at,
                    artifact_count: artifacts.length,
                    artifacts,
                };
            }).sort((left, right) => {
                const priority = { missing: 2, stale: 1, fresh: 0 } as const;
                if (priority[left.receipt_state] !== priority[right.receipt_state]) {
                    return priority[right.receipt_state] - priority[left.receipt_state];
                }
                if (left.artifact_count !== right.artifact_count) {
                    return right.artifact_count - left.artifact_count;
                }
                if (left.open_beads !== right.open_beads) {
                    return right.open_beads - left.open_beads;
                }
                return left.root_path.localeCompare(right.root_path);
            });
            const receipt_count = per_root.filter((entry) => entry.latest_receipt_path).length;
            const stale_receipt_count = per_root.filter((entry) => entry.receipt_state === 'stale').length;
            const report_count = per_root.filter((entry) => entry.latest_report_path).length;
            const artifact_count = per_root.reduce((sum, entry) => sum + entry.artifact_count, 0);
            const total_open_beads = per_root.reduce((sum, entry) => sum + Number(entry.open_beads ?? 0), 0);
            const total_validation_runs = per_root.reduce((sum, entry) => sum + Number(entry.validation_runs ?? 0), 0);
            const statusPath = buildStatusReceiptPath(now);
            const statusReceipt = database.saveHallDocumentSnapshot({
                root_path: statusRoot,
                document_path: statusPath,
                content: buildPennyOneStatusContent({
                    reported_at: now,
                    estate: payload.estate ?? false,
                    roots,
                    artifact_kind: artifactKind,
                    since: payload.since,
                    since_date: payload.since_date,
                    receipt_count,
                    stale_receipt_count,
                    report_count,
                    artifact_count,
                    total_open_beads,
                    total_validation_runs,
                    per_root,
                }),
                title: 'PennyOne Hall Maintenance Status',
                summary: `Status captured for ${roots.length} root(s) with ${receipt_count} normalize receipt(s), ${report_count} hygiene report(s), ${artifact_count} maintenance artifact(s), ${total_open_beads} open bead(s), and ${total_validation_runs} validation run(s).`,
                doc_kind: 'maintenance',
                source_label: 'pennyone-status',
                metadata: {
                    source: 'pennyone-status',
                    status_kind: 'pennyone-maintenance-status',
                    estate: payload.estate ?? false,
                    roots,
                    artifact_kind: artifactKind,
                    since: payload.since,
                    since_date: payload.since_date,
                },
                created_at: now,
            });

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: formatPennyOneStatusOutput({
                    roots,
                    receipt_count,
                    stale_receipt_count,
                    report_count,
                    artifact_count,
                    total_open_beads,
                    total_validation_runs,
                    per_root,
                }),
                metadata: {
                    adapter: 'runtime:pennyone-status',
                    action: payload.action,
                    estate: payload.estate ?? false,
                    artifact_kind: artifactKind,
                    limit,
                    since: payload.since,
                    since_date: payload.since_date,
                    roots,
                    per_root,
                    receipt_count,
                    stale_receipt_count,
                    report_count,
                    artifact_count,
                    total_open_beads,
                    total_validation_runs,
                    status_document_path: statusReceipt.document.path,
                    status_document_id: statusReceipt.document.document_id,
                    status_version_id: statusReceipt.version.version_id,
                },
            };
        }

        if (payload.action === 'stats') {
            const analyticsScript = join(projectRoot, 'scripts', 'p1_analytics.ts');
            if (!fs.existsSync(analyticsScript)) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `PennyOne analytics script not found at ${analyticsScript}`,
                };
            }

            await execa(process.execPath, [join(projectRoot, 'scripts', 'run-tsx.mjs'), analyticsScript], {
                stdio: 'inherit',
                cwd: projectRoot,
                env: { ...process.env },
            });

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'PennyOne analytics completed.',
                metadata: { adapter: 'legacy:pennyone', action: payload.action },
            };
        }

        if (payload.action === 'view') {
            await writeProjectedMatrixGraph(projectRoot, database.getLatestHallScanId(projectRoot));
            const pennyoneBin = join(projectRoot, 'bin', 'pennyone.js');
            await execa(process.execPath, [join(projectRoot, 'scripts', 'run-tsx.mjs'), pennyoneBin, 'view', resolveTargetPath(projectRoot, payload.path)], {
                stdio: 'inherit',
                cwd: projectRoot,
                env: { ...process.env },
            });

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'PennyOne visualization bridge launched.',
                metadata: { adapter: 'legacy:pennyone', action: payload.action },
            };
        }

        if (payload.action === 'clean') {
            const targetRoot = resolveTargetPath(projectRoot, payload.path);
            const statsDir = join(targetRoot, '.stats');

            if (payload.total_reset) {
                await fsPromises.rm(statsDir, { recursive: true, force: true });
                return {
                    weave_id: this.id,
                    status: 'TRANSITIONAL',
                    output: 'PennyOne total reset complete.',
                    metadata: { adapter: 'legacy:pennyone', action: payload.action, total_reset: true },
                };
            }

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'PennyOne surgical clean complete. Long-term memory preserved.',
                metadata: { adapter: 'legacy:pennyone', action: payload.action, ghosts: payload.ghosts ?? true },
            };
        }

        const scanPath = resolveTargetPath(projectRoot, payload.path);
        const results = await runScan(scanPath);
        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: `PennyOne scan complete. Total files: ${results.length}.`,
            metadata: { adapter: 'legacy:pennyone', action: 'scan', files: results.length },
        };
    }
}
