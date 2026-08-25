import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { resolveExistingPathInside } from '../contracts/runtime.js';

// cstar_warden — on-demand Sentinel Warden invocations.
// Python wardens are deterministic (AST/text scans). The handler shells
// out to a small Python driver (scripts/run_warden.py) that imports the
// named warden, runs `.scan()`, and emits JSON. No LLM in the loop.
//
// `KNOWN_WARDENS_FALLBACK` is the boot-time / driver-unavailable fallback.
// Source of truth is `scripts/run_warden.py#WARDEN_REGISTRY`, which is
// consulted lazily via `--list-wardens` by the `list` action. Drift
// between this constant and the driver only matters when the driver is
// missing or python is unavailable.
const KNOWN_WARDENS_FALLBACK = [
    'norn',
    'valkyrie',
    'freya',
    'mimir',
    'ghost',
    'security',
    'huginn',
    'taste',
    'edda',
    'scour',
    'runecaster',
    'shadow_forge',
] as const;

function resolveWardenPython(projectRoot: string): string {
    const windows = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    const unix = path.join(projectRoot, '.venv', 'bin', 'python');
    if (process.platform === 'win32' && fs.existsSync(windows)) return windows;
    if (process.platform !== 'win32' && fs.existsSync(unix)) return unix;
    return process.platform === 'win32' ? 'python' : 'python3';
}

const MCP_WARDEN_STDOUT_MAX = 256 * 1024;
const MCP_WARDEN_TIMEOUT_MS = 60_000;

async function loadWardenInventoryFromDriver(
    projectRoot: string,
): Promise<
    | { source: 'driver'; wardens: Array<{ slug: string; module: string; class: string }> }
    | null
> {
    const driver = path.join(projectRoot, 'scripts', 'run_warden.py');
    if (!fs.existsSync(driver)) {
        return null;
    }
    try {
        const result = await execa(
            resolveWardenPython(projectRoot),
            [driver, '--list-wardens'],
            {
                cwd: projectRoot,
                env: { ...process.env, PYTHONPATH: projectRoot },
                timeout: 10_000,
                reject: false,
            },
        );
        if (result.exitCode !== 0) {
            return null;
        }
        const parsed = JSON.parse(result.stdout) as {
            status?: string;
            wardens?: Array<{ slug: string; module: string; class: string }>;
        };
        if (parsed.status !== 'ok' || !Array.isArray(parsed.wardens)) {
            return null;
        }
        return { source: 'driver', wardens: parsed.wardens };
    } catch {
        return null;
    }
}

export async function handleWarden({
    action,
    warden,
    target,
}: {
    action: 'list' | 'bounties' | 'scan';
    warden?: string;
    target?: string;
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        if (action === 'list') {
            const live = await loadWardenInventoryFromDriver(root);
            if (live) {
                return textResponse({
                    status: 'ok',
                    source: 'driver',
                    count: live.wardens.length,
                    wardens: live.wardens,
                });
            }
            // Driver unavailable — fall back to the cached static list.
            return textResponse({
                status: 'ok',
                source: 'fallback',
                count: KNOWN_WARDENS_FALLBACK.length,
                wardens: KNOWN_WARDENS_FALLBACK.map((slug) => ({ slug })),
                warning: 'scripts/run_warden.py unavailable; returning cached inventory',
            });
        }
        if (action === 'bounties') {
            const ledgerPath = path.join(root, '.agents', 'tech_debt_ledger.json');
            if (!fs.existsSync(ledgerPath)) {
                return textResponse({ status: 'ok', count: 0, top_targets: [] });
            }
            const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as {
                top_targets?: unknown[];
                timestamp?: string;
            };
            const top = Array.isArray(raw.top_targets) ? raw.top_targets : [];
            return textResponse({
                status: 'ok',
                timestamp: raw.timestamp,
                count: top.length,
                top_targets: top,
            });
        }
        if (action === 'scan') {
            if (!warden) {
                return textResponse({ error: 'scan requires warden name (use list to see available)' }, true);
            }
            const normalized = warden.trim().toLowerCase();
            // The Python driver is the source of truth for warden validity.
            // The static `KNOWN_WARDENS_FALLBACK` only short-circuits a malformed
            // slug; the driver still emits a structured `status: unknown_warden`
            // envelope if the runtime registry doesn't contain it.
            if (
                !/^[a-z0-9_]+$/.test(normalized)
                || normalized.length === 0
                || normalized.length > 64
            ) {
                return textResponse(
                    { error: `warden slug must match [a-z0-9_]+ (got "${warden}")` },
                    true,
                );
            }
            const driver = path.join(root, 'scripts', 'run_warden.py');
            if (!fs.existsSync(driver)) {
                return textResponse({ error: 'warden driver missing: scripts/run_warden.py' }, true);
            }

            // Resolve and validate optional target against the project root.
            // A `target` directory becomes the warden's effective root; a file
            // is surfaced as advisory metadata. Either way it must stay inside
            // the project root to prevent the warden from walking the host.
            let resolvedTarget: string | undefined;
            let targetIsDir = false;
            if (target) {
                const abs = path.resolve(root, target);
                let safeTarget: string;
                try {
                    safeTarget = resolveExistingPathInside(root, abs);
                } catch {
                    const relative = path.relative(path.resolve(root), abs);
                    const lexicallyInside = relative === ''
                        || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
                    if (lexicallyInside && !fs.existsSync(abs)) {
                        return textResponse({ error: `target does not exist: ${target}` }, true);
                    }
                    return textResponse(
                        { error: 'target must resolve to a path inside the project root' },
                        true,
                    );
                }
                resolvedTarget = safeTarget;
                targetIsDir = fs.lstatSync(safeTarget).isDirectory();
            }

            const py = resolveWardenPython(root);
            const args = [driver, '--warden', normalized];
            if (resolvedTarget) {
                args.push('--target', resolvedTarget);
                if (targetIsDir) {
                    args.push('--root', resolvedTarget);
                }
            }

            // reject:false — the driver uses nonzero exit codes to flag
            // structured conditions (dependency_missing=5, scan_failed=4,
            // import_failed=3). We always read stdout and let the envelope's
            // `status` field carry the meaning. Real process failures (timeout,
            // maxBuffer) still surface through the thrown error path.
            let stdout: string;
            let exitCode: number | undefined;
            try {
                const result = await execa(py, args, {
                    cwd: root,
                    env: { ...process.env, PYTHONPATH: root },
                    timeout: MCP_WARDEN_TIMEOUT_MS,
                    maxBuffer: MCP_WARDEN_STDOUT_MAX,
                    reject: false,
                });
                stdout = result.stdout;
                exitCode = result.exitCode ?? undefined;
            } catch (execErr: any) {
                if (execErr?.timedOut) {
                    return textResponse(
                        { error: `warden '${normalized}' timed out after ${MCP_WARDEN_TIMEOUT_MS}ms` },
                        true,
                    );
                }
                if (execErr?.shortMessage?.includes('maxBuffer')) {
                    return textResponse(
                        { error: `warden '${normalized}' exceeded stdout cap (${MCP_WARDEN_STDOUT_MAX} bytes)` },
                        true,
                    );
                }
                return errorResponse(execErr);
            }

            const root_used = targetIsDir ? resolvedTarget : root;
            try {
                const parsed = JSON.parse(stdout) as { status?: string } & Record<string, unknown>;
                const envelopeStatus = typeof parsed.status === 'string' ? parsed.status : 'ok';
                const isError = envelopeStatus !== 'ok' && envelopeStatus !== 'matched';
                return textResponse(
                    {
                        status: envelopeStatus,
                        warden: normalized,
                        root_used,
                        exit_code: exitCode,
                        ...parsed,
                    },
                    isError,
                );
            } catch {
                return textResponse(
                    {
                        status: exitCode === 0 ? 'ok' : 'scan_failed',
                        warden: normalized,
                        root_used,
                        exit_code: exitCode,
                        raw_output: stdout.slice(0, 1024),
                    },
                    exitCode !== 0,
                );
            }
        }
        return textResponse({ error: `invalid warden action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
