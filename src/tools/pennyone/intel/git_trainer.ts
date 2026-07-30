import path from 'node:path';
import { fileURLToPath } from 'node:url';


export const RETIRED_GIT_TRAINER_ERROR =
    'legacy_git_trainer_retired_use_cstar_kernel';


export async function seedGitGravity(): Promise<never> {
    throw new Error(RETIRED_GIT_TRAINER_ERROR);
}


export function main(stderr = process.stderr): number {
    stderr.write(`${RETIRED_GIT_TRAINER_ERROR}\n`);
    return 1;
}


const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
