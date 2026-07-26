/** Child-process environment boundary for CStar intelligence bridges. */

const RETIRED_CHILD_ENV_KEYS = new Set([
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_API_DAEMON_KEY',
    'MUNINN_API_KEY',
]);
const RETIRED_CHILD_ENV_PREFIXES = [
    'GEMINI_',
    'GOOGLE_GENAI_',
    'GOOGLE_GEMINI_',
];

export function sanitizeChildProcessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const childEnv: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(env)) {
        const normalized = key.toUpperCase();
        if (RETIRED_CHILD_ENV_KEYS.has(normalized)) {
            continue;
        }
        if (RETIRED_CHILD_ENV_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
            continue;
        }
        childEnv[key] = value;
    }
    return childEnv;
}
