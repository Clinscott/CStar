import path from 'node:path';

import { writeReleaseBundles } from '../src/packaging/distributions.js';

const projectRoot = process.cwd();
const bundles = writeReleaseBundles(projectRoot);
const manifestPath = path.join(projectRoot, 'dist', 'host-distributions', 'manifest.json');

console.log('[corvus:release-bundles] Wrote external-runtime-dependent host overlays.');
for (const bundle of bundles) {
    console.log(`- ${bundle.name}: ${bundle.rootDir}`);
}
console.log(`- manifest: ${path.relative(projectRoot, manifestPath)}`);
