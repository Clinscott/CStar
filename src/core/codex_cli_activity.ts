import fs from 'node:fs';
import path from 'node:path';

export const CODEX_CLI_ACTIVITY_STATE_RELATIVE_PATH = path.join('.agents', 'state', 'codex-cli-activity.json');

type CodexCliActivitySurface = 'host-session' | 'delegation';
type CodexCliActivityPhase = 'running' | 'completed' | 'failed' | 'aborted';

interface CodexCliActivityRecord {
    schema_version: 1;
    active: boolean;
    activity_id: string;
    pid: number;
    surface: CodexCliActivitySurface;
    command: string;
    cwd: string;
    output_path: string;
    warning: string;
    started_at: string;
    completed_at?: string;
    phase: CodexCliActivityPhase;
    detail?: string;
}

interface StartCodexCliActivityOptions {
    projectRoot: string;
    env: NodeJS.ProcessEnv;
    surface: CodexCliActivitySurface;
    cwd: string;
    command: string;
    outputPath: string;
}

interface FinishCodexCliActivityOptions {
    phase: Exclude<CodexCliActivityPhase, 'running'>;
    detail?: string;
}

export interface CodexCliActivityHandle {
    close(options: FinishCodexCliActivityOptions): void;
}

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const WARNING_BANNER = 'WRITING TO FILE DO NOT SHUTDOWN';

function shouldAnnounce(env: NodeJS.ProcessEnv): boolean {
    const override = env.CSTAR_VERBOSE_CLI_LOCKS?.trim().toLowerCase();
    if (override && ['0', 'false', 'no', 'off'].includes(override)) {
        return false;
    }
    return true;
}

function buildPulseBar(tick: number): string {
    const width = 12;
    const active = tick % width;
    return `[${'='.repeat(active + 1).padEnd(width, ' ')}]`;
}

function writeStateFile(projectRoot: string, record: CodexCliActivityRecord): void {
    const statePath = path.join(projectRoot, CODEX_CLI_ACTIVITY_STATE_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
}

function printLine(message: string): void {
    process.stderr.write(`${message}\n`);
}

export function startCodexCliActivity(options: StartCodexCliActivityOptions): CodexCliActivityHandle {
    const record: CodexCliActivityRecord = {
        schema_version: 1,
        active: true,
        activity_id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        pid: process.pid,
        surface: options.surface,
        command: options.command,
        cwd: options.cwd,
        output_path: options.outputPath,
        warning: WARNING_BANNER,
        started_at: new Date().toISOString(),
        phase: 'running',
    };

    writeStateFile(options.projectRoot, record);

    const announce = shouldAnnounce(options.env);
    const interactive = announce && Boolean(process.stderr.isTTY);
    const startMs = Date.now();
    let tick = 0;
    let interval: NodeJS.Timeout | null = null;
    let closed = false;

    if (announce) {
        printLine(
            `[Corvus] ${WARNING_BANNER} | codex exec ${options.surface} started | output=${options.outputPath}`,
        );
        interval = setInterval(() => {
            tick += 1;
            const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startMs) / 1000));
            const frame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
            const line = `${frame} ${WARNING_BANNER} ${buildPulseBar(tick)} ${elapsedSeconds}s | codex exec ${options.surface} | output=${path.basename(options.outputPath)}`;
            if (interactive) {
                process.stderr.write(`\r${line}`);
                return;
            }
            if (tick === 1 || tick % 5 === 0) {
                printLine(`[Corvus] ${line}`);
            }
        }, 1000);
        interval.unref?.();
    }

    return {
        close({ phase, detail }: FinishCodexCliActivityOptions): void {
            if (closed) {
                return;
            }
            closed = true;
            if (interval) {
                clearInterval(interval);
            }

            const completedRecord: CodexCliActivityRecord = {
                ...record,
                active: false,
                phase,
                completed_at: new Date().toISOString(),
                detail,
            };
            writeStateFile(options.projectRoot, completedRecord);

            if (!announce) {
                return;
            }
            const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startMs) / 1000));
            const suffix = detail ? ` | ${detail}` : '';
            if (interactive) {
                process.stderr.write('\r');
            }
            printLine(
                `[Corvus] codex exec ${options.surface} ${phase} after ${elapsedSeconds}s | output=${options.outputPath}${suffix}`,
            );
        },
    };
}
