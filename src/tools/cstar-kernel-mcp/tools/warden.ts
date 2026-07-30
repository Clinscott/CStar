import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { registry } from '../../pennyone/pathRegistry.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    CODE_ROOT,
    readBoundedUtf8FileInside,
    resolveExistingPathInside,
} from '../contracts/runtime.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';

// cstar_warden — on-demand Sentinel Warden invocations.
// Python wardens are deterministic (AST/text scans). The handler shells
// out to a small Python driver (scripts/run_warden.py) that imports the
// named warden, runs `.scan()`, and emits JSON. No LLM in the loop.
//
// Inventory is static so `list` never starts Python or inherits process state.
// The Python driver mirrors this table and remains authoritative at scan time.
const KNOWN_WARDEN_INVENTORY = Object.freeze([
    { slug: 'norn', module: 'src.core.engine.wardens.norn', class: 'NornWarden' },
    { slug: 'valkyrie', module: 'src.core.engine.wardens.valkyrie', class: 'ValkyrieWarden' },
    { slug: 'freya', module: 'src.core.engine.wardens.freya', class: 'FreyaWarden' },
    { slug: 'mimir', module: 'src.core.engine.wardens.mimir', class: 'MimirWarden' },
    { slug: 'ghost', module: 'src.core.engine.wardens.ghost_warden', class: 'GhostWarden' },
    { slug: 'security', module: 'src.core.engine.wardens.security', class: 'SecurityWarden' },
    { slug: 'huginn', module: 'src.core.engine.wardens.huginn', class: 'HuginnWarden' },
    { slug: 'taste', module: 'src.core.engine.wardens.taste', class: 'TasteWarden' },
    { slug: 'edda', module: 'src.core.engine.wardens.edda', class: 'EddaWarden' },
    { slug: 'scour', module: 'src.core.engine.wardens.scour', class: 'ScourWarden' },
    { slug: 'runecaster', module: 'src.core.engine.wardens.runecaster', class: 'RuneCasterWarden' },
]);

export function resolveWardenPython(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    const expected = process.platform === 'win32'
        ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
        : path.join(projectRoot, '.venv', 'bin', 'python');
    const configured = env.CSTAR_PYTHON_EXECUTABLE?.trim();
    if (configured && (!path.isAbsolute(configured) || path.resolve(configured) !== path.resolve(expected))) {
        throw new Error('cstar_warden_python_interpreter_outside_project_venv');
    }
    if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) {
        throw new Error('cstar_warden_python_interpreter_unavailable');
    }
    if (process.platform !== 'win32' && (fs.statSync(expected).mode & 0o111) === 0) {
        throw new Error('cstar_warden_python_interpreter_not_executable');
    }
    return expected;
}

export function buildWardenSubprocessEnv(projectRoot: string): NodeJS.ProcessEnv {
    return {
        PYTHONPATH: projectRoot,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PYTHONNOUSERSITE: '1',
        ...(process.platform === 'linux' ? {
            TMPDIR: '/tmp',
            TMP: '/tmp',
            TEMP: '/tmp',
        } : {}),
    };
}

const MCP_WARDEN_STDOUT_MAX = 256 * 1024;
const MCP_WARDEN_TIMEOUT_MS = 60_000;

export async function handleWarden({
    action,
    warden,
    target,
}: {
    action: 'list' | 'bounties' | 'scan';
    warden?: string;
    target?: string;
}, requestContext?: McpRequestContext): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        if (action === 'list') {
            return textResponse({
                status: 'ok',
                source: 'static_deterministic',
                count: KNOWN_WARDEN_INVENTORY.length,
                wardens: KNOWN_WARDEN_INVENTORY,
            });
        }
        if (action === 'bounties') {
            const ledgerPath = path.join(root, '.agents', 'tech_debt_ledger.json');
            if (!fs.existsSync(ledgerPath)) {
                return textResponse({ status: 'ok', count: 0, top_targets: [] });
            }
            const ledger = readBoundedUtf8FileInside(root, ledgerPath, 512 * 1024);
            const raw = JSON.parse(ledger.content) as {
                top_targets?: unknown[];
                timestamp?: string;
            };
            const top = Array.isArray(raw.top_targets) ? raw.top_targets.slice(0, 100) : [];
            return textResponse({
                status: 'ok',
                timestamp: raw.timestamp,
                count: top.length,
                top_targets: top,
            });
        }
        if (action === 'scan') {
            // A scan launches project-controlled code. Bind the call to the
            // current canonical root-user turn before inspecting the driver,
            // interpreter, target path, or starting a subprocess.
            await verifyCodexRequestIdentity(requestContext);
            if (!warden) {
                return textResponse({ error: 'scan requires warden name (use list to see available)' }, true);
            }
            const normalized = warden.trim().toLowerCase();
            // The Python driver is the source of truth for scan-time validity;
            // malformed slugs are rejected before any process is started.
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
            const driver = path.join(CODE_ROOT, 'scripts', 'run_warden.py');
            if (!fs.existsSync(driver)) {
                return textResponse({ error: 'warden driver missing: scripts/run_warden.py' }, true);
            }
            resolveExistingPathInside(CODE_ROOT, driver, 'file');

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
                    env: buildWardenSubprocessEnv(CODE_ROOT),
                    extendEnv: false,
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
