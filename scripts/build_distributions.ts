import { buildDistributions, validateDistributions, writeDistributions } from '../src/packaging/distributions.js';

const projectRoot = process.cwd();
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
    const mismatches = validateDistributions(projectRoot);
    if (mismatches.length > 0) {
        console.error('[corvus:distributions] Distribution artifacts are out of date.');
        for (const mismatch of mismatches) {
            console.error(`- ${mismatch}`);
        }
        process.exit(1);
    }

    const build = buildDistributions(projectRoot);
    console.log(`[corvus:distributions] OK (${build.files.length} artifacts verified).`);
    process.exit(0);
}

const files = writeDistributions(projectRoot);
console.log(`[corvus:distributions] Wrote ${files.length} artifacts.`);
for (const file of files) {
    console.log(`- ${file.relativePath}`);
}
