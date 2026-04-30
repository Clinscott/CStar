import fs from 'node:fs';

export function testExists(path: string) {
    return fs.existsSync(path);
}
