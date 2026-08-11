import fs from 'node:fs';

import { fail } from './contracts.js';

export const OPERATION_GUARD_MAX_BYTES = 64 * 1024;

export function assertPrivateOperationGuard(
    stat: fs.BigIntStats,
    allowedLinks: readonly bigint[] = [1n],
): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || !allowedLinks.includes(stat.nlink)
        || (stat.mode & 0o7777n) !== 0o600n || stat.uid !== BigInt(uid)) {
        fail('repository operation guard must be an exact private owned regular file');
    }
}

export function assertSameOperationGuard(
    before: fs.BigIntStats,
    after: fs.BigIntStats,
    message: string,
): void {
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) {
        if (before[key] !== after[key]) fail(message);
    }
}

export function readStablePrivateFile(
    file: string,
    label: string,
    allowedLinks: readonly bigint[],
): { content: Buffer; stat: fs.BigIntStats } {
    if (typeof fs.constants.O_NONBLOCK !== 'number') {
        fail(`${label} requires nonblocking descriptor support`);
    }
    const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(before, allowedLinks);
        if (before.size < 1n || before.size > BigInt(OPERATION_GUARD_MAX_BYTES)) {
            fail(`${label} exceeds its byte limit`);
        }
        const content = Buffer.allocUnsafe(Number(before.size));
        let offset = 0;
        while (offset < content.length) {
            const count = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (count === 0) fail(`${label} changed while it was read`);
            offset += count;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(after, allowedLinks);
        assertSameOperationGuard(before, after, `${label} changed while it was read`);
        const linked = fs.lstatSync(file, { bigint: true });
        assertPrivateOperationGuard(linked, allowedLinks);
        assertSameOperationGuard(after, linked, `${label} path changed while it was read`);
        return { content, stat: linked };
    } finally {
        fs.closeSync(descriptor);
    }
}
