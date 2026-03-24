export type HostProvider = 'gemini' | 'codex' | 'claude';

export interface HostBridgeConfig {
    command: string;
    args: string[];
}

function normalizeFlag(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return undefined;
}

export function detectHostProvider(env: NodeJS.ProcessEnv = process.env): HostProvider | null {
    const override = env.CORVUS_HOST_PROVIDER?.trim().toLowerCase();
    if (override === 'gemini' || override === 'codex' || override === 'claude') {
        return override;
    }

    if (env.GEMINI_CLI_ACTIVE === 'true' || env.GEMINI_CLI === '1') {
        return 'gemini';
    }

    if (env.CODEX_SHELL === '1' || Boolean(env.CODEX_THREAD_ID)) {
        return 'codex';
    }

    return null;
}

export function isHostSessionActive(env: NodeJS.ProcessEnv = process.env): boolean {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override !== undefined) {
        return override;
    }

    return detectHostProvider(env) !== null;
}

export function resolveHostProvider(
    env: NodeJS.ProcessEnv = process.env,
    fallback: HostProvider = 'gemini',
): HostProvider | null {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override === false) {
        return null;
    }

    const provider = detectHostProvider(env);
    if (provider) {
        return provider;
    }

    return isHostSessionActive(env) ? fallback : null;
}

export function getHostProviderBanner(provider: HostProvider | null): string {
    if (provider === 'codex') {
        return ' ◤ CODEX CLI INTEGRATION ACTIVE ◢ ';
    }
    if (provider === 'claude') {
        return ' ◤ CLAUDE CLI INTEGRATION ACTIVE ◢ ';
    }
    return ' ◤ GEMINI CLI INTEGRATION ACTIVE ◢ ';
}

export function getHostMindLabel(provider: HostProvider | null): string {
    if (provider === 'codex') {
        return 'OPENAI CODEX';
    }
    if (provider === 'claude') {
        return 'CLAUDE HOST';
    }
    if (provider === 'gemini') {
        return 'GEMINI-3.1-PRO';
    }
    return 'HOST SESSION';
}

function parseBridgeArgsJson(raw: string | undefined, envName: string): string[] {
    if (!raw?.trim()) {
        return ['{prompt}'];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${envName} must be valid JSON: ${message}`);
    }

    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
        throw new Error(`${envName} must be a JSON array of strings.`);
    }

    return parsed;
}

function getProviderBridgeEnvNames(provider: HostProvider): { command: string; args: string } {
    const prefix = `CORVUS_${provider.toUpperCase()}_HOST_BRIDGE`;
    return {
        command: `${prefix}_CMD`,
        args: `${prefix}_ARGS_JSON`,
    };
}

export function resolveConfiguredHostBridge(
    env: NodeJS.ProcessEnv = process.env,
    provider: HostProvider,
): HostBridgeConfig | null {
    const providerEnv = getProviderBridgeEnvNames(provider);
    const providerCommand = env[providerEnv.command]?.trim();
    if (providerCommand) {
        return {
            command: providerCommand,
            args: parseBridgeArgsJson(env[providerEnv.args], providerEnv.args),
        };
    }

    const sharedCommand = env.CORVUS_HOST_BRIDGE_CMD?.trim();
    if (sharedCommand) {
        return {
            command: sharedCommand,
            args: parseBridgeArgsJson(env.CORVUS_HOST_BRIDGE_ARGS_JSON, 'CORVUS_HOST_BRIDGE_ARGS_JSON'),
        };
    }

    return null;
}

export function expandHostBridgeArgs(
    template: string[],
    values: {
        prompt: string;
        project_root: string;
        provider: HostProvider;
    },
): string[] {
    return template.map((entry) =>
        entry
            .replaceAll('{prompt}', values.prompt)
            .replaceAll('{project_root}', values.project_root)
            .replaceAll('{provider}', values.provider),
    );
}

export function getHostBridgeConfigurationHint(provider: HostProvider): string {
    const providerEnv = getProviderBridgeEnvNames(provider);
    return `Set ${providerEnv.command} and ${providerEnv.args}, set CORVUS_HOST_BRIDGE_CMD and CORVUS_HOST_BRIDGE_ARGS_JSON, or supply an explicit hostSessionInvoker.`;
}
