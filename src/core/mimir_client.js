/**
 * Retired CommonJS-era Mimir bridge.
 *
 * This duplicate must remain import-safe for stale consumers, but it must not
 * shell into Python, forward environment state, or invoke a host model. The
 * canonical TypeScript compatibility surface is independently fail-closed.
 */

export const RETIRED_MIMIR_JS_ERROR = 'legacy_mimir_js_bridge_retired_use_host_native_researcher';

export const mimir = Object.freeze({
    async think() {
        return RETIRED_MIMIR_JS_ERROR;
    },
    async get_file_intent() {
        return RETIRED_MIMIR_JS_ERROR;
    },
    async close() {
        return undefined;
    },
});

export default mimir;
