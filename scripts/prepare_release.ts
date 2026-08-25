import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();

const steps = [
    ['build:distributions', ['scripts/build_distributions.ts']],
    ['validate:distributions', ['scripts/build_distributions.ts', '--check']],
    ['build:release-bundles', ['scripts/build_release_bundles.ts']],
    ['build:release-archives', ['scripts/build_release_archives.ts']],
] as const;

for (const [label, args] of steps) {
    console.log(`[corvus:release-prepare] ${label}`);
    const result = spawnSync('node', ['scripts/run-tsx.mjs', ...args], {
        cwd: projectRoot,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

console.log('[corvus:release-prepare] Release artifacts are ready under dist/host-distributions and dist/releases.');
