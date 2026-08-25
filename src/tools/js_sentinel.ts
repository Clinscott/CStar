import { fileURLToPath } from 'node:url';

export const JS_SENTINEL_RETIRED =
    'legacy_js_sentinel_retired_use_project_tests_or_cstar_warden';

/** Retired compatibility entrypoint; never starts npx, ESLint, or auto-fix. */
export async function runSentinel(_target = '.', _fix = false): Promise<never> {
    throw new Error(JS_SENTINEL_RETIRED);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    void runSentinel().catch(() => {
        process.stderr.write(`${JS_SENTINEL_RETIRED}\n`);
        process.exitCode = 1;
    });
}
