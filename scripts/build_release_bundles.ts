import fs from 'node:fs';
import path from 'node:path';

import { writeReleaseBundles } from '../src/packaging/distributions.js';

const projectRoot = process.cwd();
const bundles = writeReleaseBundles(projectRoot);
const manifestPath = path.join(projectRoot, 'dist', 'host-distributions', 'manifest.json');

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
        generated_at: new Date().toISOString(),
        bundles: bundles.map((bundle) => ({
            name: bundle.name,
            rootDir: bundle.rootDir,
            files: bundle.files.map((file) => file.relativePath),
        })),
    }, null, 2)}\n`,
    'utf-8',
);

console.log('[corvus:release-bundles] Wrote release bundles.');
for (const bundle of bundles) {
    console.log(`- ${bundle.name}: ${bundle.rootDir}`);
}
console.log(`- manifest: ${path.relative(projectRoot, manifestPath)}`);
