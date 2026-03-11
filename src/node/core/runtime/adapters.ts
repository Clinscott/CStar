import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { basename, isAbsolute, join, parse, resolve } from 'node:path';
import { execa } from 'execa';

import { ANS } from '../ans.ts';
import { CortexLink } from '../../cortex_link.ts';
import { getPythonPath } from '../python_utils.ts';
import { runScan } from '../../../tools/pennyone/index.ts';
import { buildEstateTopology, writeProjectedMatrixGraph } from '../../../tools/pennyone/intel/compiler.ts';
import { getLatestHallScanId, listHallMountedSpokes } from '../../../tools/pennyone/intel/database.ts';
import { importRepositoryIntoEstate } from '../../../tools/pennyone/intel/importer.ts';
import { searchMatrix } from '../../../tools/pennyone/live/search.ts';
import { registry } from '../../../tools/pennyone/pathRegistry.ts';
import { RavensCycleWeave } from './weaves/ravens_cycle.ts';
import {
    DynamicCommandPayload,
    PennyOneWeavePayload,
    RavensWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    StartWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from './contracts.ts';

function resolvePythonPath(projectRoot: string): string {
    const winPath = join(projectRoot, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(winPath)) {
        return winPath;
    }

    const unixPath = join(projectRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(unixPath)) {
        return unixPath;
    }

    return getPythonPath();
}

function loadSkillRegistryManifest(projectRoot: string): Map<string, string> {
    const manifestPath = join(projectRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return new Map();
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
            skills?: Record<string, { entrypoint_path?: string }>;
        };
        const commands = new Map<string, string>();
        for (const [trigger, entry] of Object.entries(manifest.skills ?? {})) {
            if (!entry.entrypoint_path) {
                continue;
            }
            commands.set(trigger.toLowerCase(), join(projectRoot, entry.entrypoint_path));
        }
        return commands;
    } catch {
        return new Map();
    }
}

function discoverLegacyCommands(projectRoot: string): Map<string, string> {
    const commands = loadSkillRegistryManifest(projectRoot);
    const scriptDirs = [
        join(projectRoot, '.agents', 'skills'),
        join(projectRoot, 'src', 'tools'),
        join(projectRoot, 'src', 'skills', 'local'),
        join(projectRoot, 'skills_db'),
        join(projectRoot, 'src', 'sentinel'),
        join(projectRoot, 'scripts'),
    ];

    for (const dir of scriptDirs) {
        if (!fs.existsSync(dir)) {
            continue;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.py') && !entry.name.startsWith('_')) {
                const key = parse(entry.name).name.toLowerCase();
                if (!commands.has(key)) {
                    commands.set(key, join(dir, entry.name));
                }
                continue;
            }

            if (!entry.isDirectory() || entry.name.startsWith('.')) {
                continue;
            }

            const scriptsDir = join(dir, entry.name, 'scripts');
            const mainScript = join(scriptsDir, `${entry.name}.py`);
            const altScript = join(dir, entry.name, `${entry.name}.py`);

            if (fs.existsSync(mainScript)) {
                if (!commands.has(entry.name.toLowerCase())) {
                    commands.set(entry.name.toLowerCase(), mainScript);
                }
            } else if (fs.existsSync(altScript)) {
                if (!commands.has(entry.name.toLowerCase())) {
                    commands.set(entry.name.toLowerCase(), altScript);
                }
            }
        }
    }

    const workflowDir = join(projectRoot, '.agents', 'workflows');
    if (fs.existsSync(workflowDir)) {
        for (const file of fs.readdirSync(workflowDir)) {
            if ((file.endsWith('.md') || file.endsWith('.qmd')) && !file.startsWith('_')) {
                const key = parse(file).name.toLowerCase();
                if (!commands.has(key)) {
                    commands.set(key, join(workflowDir, file));
                }
            }
        }
    }

    return commands;
}

function loadRavensTargetRepos(projectRoot: string): string[] {
    const configPath = join(projectRoot, '.agents', 'config.json');
    if (!fs.existsSync(configPath)) {
        return [projectRoot];
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
            target_repos?: unknown;
        };
        const configuredRepos = Array.isArray(config.target_repos) ? config.target_repos : [projectRoot];
        const resolvedRepos = configuredRepos
            .map((entry) => String(entry))
            .filter(Boolean)
            .map((entry) => (isAbsolute(entry) ? entry : resolve(projectRoot, entry)));
        return resolvedRepos.length > 0 ? Array.from(new Set(resolvedRepos)) : [projectRoot];
    } catch {
        return [projectRoot];
    }
}

interface RavensSweepTarget {
    slug: string;
    domain: 'brain' | 'spoke' | 'compat';
    repo_root: string;
    requested_path: string;
}

function normalizeRepoRoot(repoRoot: string): string {
    return resolve(repoRoot).replace(/\\/g, '/');
}

function loadRavensSweepTargets(projectRoot: string, requestedSpoke?: string): RavensSweepTarget[] {
    const brainRoot = normalizeRepoRoot(projectRoot);
    const brainTarget: RavensSweepTarget = {
        slug: 'brain',
        domain: 'brain',
        repo_root: brainRoot,
        requested_path: brainRoot,
    };

    const mountedTargets = listHallMountedSpokes(projectRoot)
        .filter((entry) => entry.mount_status === 'active')
        .map((entry) => ({
            slug: entry.slug,
            domain: 'spoke' as const,
            repo_root: normalizeRepoRoot(entry.root_path),
            requested_path: `spoke://${entry.slug}/`,
        }));

    const knownRoots = new Set<string>([brainTarget.repo_root, ...mountedTargets.map((entry) => entry.repo_root)]);
    const compatibilityTargets = loadRavensTargetRepos(projectRoot)
        .map((entry) => normalizeRepoRoot(entry))
        .filter((entry) => !knownRoots.has(entry))
        .map((entry) => ({
            slug: basename(entry).toLowerCase(),
            domain: 'compat' as const,
            repo_root: entry,
            requested_path: entry,
        }));

    const targets = [brainTarget, ...mountedTargets, ...compatibilityTargets];
    if (!requestedSpoke) {
        return targets;
    }

    const requested = requestedSpoke.toLowerCase();
    return targets.filter((entry) => entry.slug === requested);
}

function resolveTargetPath(projectRoot: string, targetPath: string | undefined): string {
    if (!targetPath || targetPath === '.') {
        return projectRoot;
    }

    if (registry.isSpokeUri(targetPath)) {
        return registry.resolveEstatePath(targetPath, listHallMountedSpokes(registry.getRoot()));
    }

    return isAbsolute(targetPath) ? targetPath : resolve(projectRoot, targetPath);
}

export class StartAdapter implements RuntimeAdapter<StartWeavePayload> {
    public readonly id = 'weave:start';

    public async execute(
        invocation: WeaveInvocation<StartWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        if (payload.verbose) {
            process.env.CSTAR_VERBOSE = 'true';
        }

        if (payload.debug) {
            process.env.CSTAR_DEBUG = 'true';
        }

        if (!payload.target) {
            if (payload.loki) {
                const link = new CortexLink();
                const response = await link.sendCommand('NORN_POLL', []);

                if (response?.status === 'success') {
                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: 'Loki mode poll completed through the kernel bridge.',
                        metadata: { adapter: 'runtime:loki-poll' },
                    };
                }

                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: 'Loki mode poll failed or no tasks were available.',
                };
            }

            await ANS.wake();
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'The system is awake and synchronized. The Corvus kernel is active.',
                metadata: { adapter: 'runtime:ans-kernel' },
            };
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: `Target-driven start is no longer canonical for '${payload.target}'. Create or select a bead and dispatch TALIESIN with --bead-id.`,
            metadata: {
                adapter: 'compatibility:start-target-rejected',
                rejected_target: payload.target,
            },
        };
    }
}

export class RavensAdapter implements RuntimeAdapter<RavensWeavePayload> {
    public readonly id = 'weave:ravens';

    public constructor(
        private readonly cycleWeave: RuntimeAdapter<{ project_root: string; cwd: string }> = new RavensCycleWeave(),
        private readonly repoLoader: (projectRoot: string, requestedSpoke?: string) => RavensSweepTarget[] = loadRavensSweepTargets,
    ) {}

    private async executeCycleForTarget(
        kernelRoot: string,
        target: RavensSweepTarget,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        return this.cycleWeave.execute(
            {
                weave_id: 'weave:ravens-cycle',
                payload: {
                    project_root: target.repo_root,
                    cwd: target.repo_root,
                },
            },
            {
                ...context,
                workspace_root: kernelRoot,
                target_domain: target.domain === 'spoke' ? 'spoke' : target.domain === 'compat' ? 'external' : 'brain',
                spoke_name: target.domain === 'spoke' ? target.slug : undefined,
                spoke_root: target.domain === 'spoke' ? target.repo_root : undefined,
                requested_root: target.requested_path,
            },
        );
    }

    public async execute(
        invocation: WeaveInvocation<RavensWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const projectRoot = context.workspace_root;
        const wardenDir = join(projectRoot, 'src', 'sentinel', 'wardens');
        const payload = invocation.payload;
        const sweepTargets = this.repoLoader(projectRoot, payload.spoke);

        if (payload.spoke && sweepTargets.length === 0) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Ravens cannot resolve mounted target '${payload.spoke}'. Link the spoke first or target the brain explicitly.`,
            };
        }

        if (payload.action === 'cycle') {
            const cycleTarget = sweepTargets[0] ?? {
                slug: 'brain',
                domain: 'brain' as const,
                repo_root: projectRoot,
                requested_path: projectRoot,
            };
            const cycleResult = await this.executeCycleForTarget(projectRoot, cycleTarget, context);

            return {
                ...cycleResult,
                weave_id: this.id,
                metadata: {
                    ...(cycleResult.metadata ?? {}),
                    adapter: 'runtime:ravens-cycle-wrapper',
                    delegated_weave_id: 'weave:ravens-cycle',
                    target_slug: cycleTarget.slug,
                    target_domain: cycleTarget.domain,
                    target_repo_root: cycleTarget.repo_root,
                },
            };
        }

        const activeWardens = fs.existsSync(wardenDir)
            ? fs.readdirSync(wardenDir)
                .filter((file) => file.endsWith('.py') && !file.startsWith('__'))
                .map((file) => file.replace('.py', ''))
            : [];

        if (payload.action === 'status') {
            const activeMountedSpokes = sweepTargets.filter((target) => target.domain === 'spoke').length;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Raven runtime status: STANDBY. Estate sweep configured for ${sweepTargets.length} target(s), including ${activeMountedSpokes} mounted spoke(s). Active wardens available: ${activeWardens.length}.`,
                metadata: {
                    adapter: 'runtime:ravens-kernel-status',
                    active_wardens: activeWardens,
                    estate_targets: sweepTargets,
                    target_repos: sweepTargets.map((target) => target.repo_root),
                },
            };
        }

        if (payload.action === 'stop') {
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'No resident Muninn daemon is running. Ravens now execute as one-shot kernel sweeps.',
                metadata: {
                    adapter: 'runtime:ravens-kernel-status',
                    active_wardens: activeWardens,
                },
            };
        }

        const sweepResults = [];

        for (const target of sweepTargets) {
            const cycleResult = await this.executeCycleForTarget(projectRoot, target, context);
            sweepResults.push({
                target_slug: target.slug,
                target_domain: target.domain,
                repo_root: target.repo_root,
                requested_path: target.requested_path,
                status: cycleResult.status,
                output: cycleResult.output,
                error: cycleResult.error,
                cycle_result: cycleResult.metadata?.cycle_result,
            });
        }

        const successes = sweepResults.filter((result) => result.status === 'SUCCESS').length;
        const failures = sweepResults.filter((result) => result.status === 'FAILURE').length;
        const transitional = sweepResults.length - successes - failures;
        const status = failures === sweepResults.length
            ? 'FAILURE'
            : failures > 0 || transitional > 0
                ? 'TRANSITIONAL'
                : 'SUCCESS';

        return {
            weave_id: this.id,
            status,
            output: `Ravens sweep completed across ${sweepTargets.length} target(s): ${successes} success, ${transitional} transitional, ${failures} failure.`,
            metadata: {
                adapter: 'runtime:ravens-sweep',
                active_wardens: activeWardens,
                sweep_results: sweepResults,
                estate_targets: sweepTargets,
                target_repos: sweepTargets.map((target) => target.repo_root),
                shadow_forge: payload.shadow_forge ?? false,
                isolated_failures: sweepResults.filter((result) => result.status === 'FAILURE'),
            },
        };
    }
}

export class PennyOneAdapter implements RuntimeAdapter<PennyOneWeavePayload> {
    public readonly id = 'weave:pennyone';

    public async execute(
        invocation: WeaveInvocation<PennyOneWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const projectRoot = context.workspace_root;
        const payload = invocation.payload;
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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

            await execa(npxCmd, ['tsx', analyticsScript], {
                stdio: 'inherit',
                cwd: projectRoot,
            });

            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'PennyOne analytics completed.',
                metadata: { adapter: 'legacy:pennyone', action: payload.action },
            };
        }

        if (payload.action === 'view') {
            await writeProjectedMatrixGraph(projectRoot, getLatestHallScanId(projectRoot));
            const pennyoneBin = join(projectRoot, 'bin', 'pennyone.js');
            await execa(npxCmd, ['tsx', pennyoneBin, 'view', resolveTargetPath(projectRoot, payload.path)], {
                stdio: 'inherit',
                cwd: projectRoot,
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

export class DynamicCommandAdapter implements RuntimeAdapter<DynamicCommandPayload> {
    public readonly id = 'weave:dynamic-command';

    public async execute(
        invocation: WeaveInvocation<DynamicCommandPayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const commands = discoverLegacyCommands(payload.project_root);
        const resolvedPath = commands.get(payload.command);

        if (!resolvedPath) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Unknown command '${payload.command}'`,
            };
        }

        const pythonPath = resolvePythonPath(payload.project_root);
        const dispatcherPath = join(payload.project_root, 'src', 'core', 'cstar_dispatcher.py');

        await execa(pythonPath, [dispatcherPath, payload.command, ...payload.args], {
            stdio: 'inherit',
            cwd: payload.cwd,
            env: { ...context.env, PYTHONPATH: payload.project_root },
        });

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: `Legacy command '${payload.command}' dispatched through the runtime adapter.`,
            metadata: { adapter: 'legacy:python-dispatcher', resolved_path: resolvedPath },
        };
    }
}
