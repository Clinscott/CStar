#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RETIRED_DIRECT_HALL_SCRIPT_ERROR =
    'legacy_direct_hall_script_retired_use_cstar_kernel';

/** Retired direct XO review and lifecycle mutation tombstone. */
export function main(stderr = process.stderr): number {
    stderr.write(`${RETIRED_DIRECT_HALL_SCRIPT_ERROR}\n`);
    return 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
