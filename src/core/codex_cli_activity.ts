import path from 'node:path';

export const CODEX_CLI_ACTIVITY_STATE_RELATIVE_PATH = path.join(
    '.agents',
    'state',
    'codex-cli-activity.json',
);

type CodexCliActivitySurface = 'host-session' | 'delegation';
type CodexCliActivityPhase = 'completed' | 'failed' | 'aborted';

interface StartCodexCliActivityOptions {
    projectRoot: string;
    env: NodeJS.ProcessEnv;
    surface: CodexCliActivitySurface;
    cwd: string;
    command: string;
    outputPath: string;
}

interface FinishCodexCliActivityOptions {
    phase: CodexCliActivityPhase;
    detail?: string;
}

export interface CodexCliActivityHandle {
    close(options: FinishCodexCliActivityOptions): void;
}

/** @deprecated Ambient Codex activity files and timers are retired. */
export function startCodexCliActivity(
    _options: StartCodexCliActivityOptions,
): never {
    throw new Error(
        'legacy_codex_cli_activity_sidecar_retired_use_host_runtime_receipt',
    );
}
