import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';

import { runScan } from '../../../../tools/pennyone/index.ts';
import { buildEstateTopology, writeProjectedMatrixGraph } from '../../../../tools/pennyone/intel/compiler.ts';
import { database } from '../../../../tools/pennyone/intel/database.ts';
import { importRepositoryIntoEstate } from '../../../../tools/pennyone/intel/importer.ts';
import { searchMatrix } from '../../../../tools/pennyone/live/search.ts';
import { registry } from '../../../../tools/pennyone/pathRegistry.ts';
import { resolveTargetPath } from '../adapters/ravens_utils.ts';
import {
    PennyOneWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

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
