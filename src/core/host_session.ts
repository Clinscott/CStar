export type HostProvider = 'gemini' | 'codex';

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
    if (override === 'gemini' || override === 'codex') {
        return override;
    }

    if (env.GEMINI_CLI_ACTIVE === 'true') {
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
    return ' ◤ GEMINI CLI INTEGRATION ACTIVE ◢ ';
}

export function getHostMindLabel(provider: HostProvider | null): string {
    if (provider === 'codex') {
        return 'OPENAI CODEX';
    }
    if (provider === 'gemini') {
        return 'GEMINI-3.1-PRO';
    }
    return 'HOST SESSION';
}
