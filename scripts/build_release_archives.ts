import path from 'node:path';

import { writeReleaseArchives } from '../src/packaging/release_archives.js';

const projectRoot = process.cwd();
const result = writeReleaseArchives(projectRoot);

console.log('[corvus:release-archives] Wrote release archives.');
for (const archive of result.archives) {
    console.log(`- ${archive.archive}`);
}
console.log(`- manifest: ${path.relative(projectRoot, result.manifestPath)}`);
