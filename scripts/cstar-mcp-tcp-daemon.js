#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RETIRED_TCP_TRANSPORT_ERROR =
    'legacy_cstar_mcp_tcp_transport_retired_use_direct_stdio';

export function main(stderr = process.stderr) {
    stderr.write(`${RETIRED_TCP_TRANSPORT_ERROR}\n`);
    return 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
