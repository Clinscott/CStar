import { createRequire } from 'node:module';

import { assertSupportedNativeRuntime } from '../../cstar-kernel-mcp/contracts/runtime_policy.js';

type BetterSqlite3Constructor = typeof import('better-sqlite3');

const require = createRequire(import.meta.url);
let cachedConstructor: BetterSqlite3Constructor | undefined;

export function getBetterSqlite3(): BetterSqlite3Constructor {
    assertSupportedNativeRuntime();
    if (!cachedConstructor) cachedConstructor = require('better-sqlite3') as BetterSqlite3Constructor;
    return cachedConstructor;
}
