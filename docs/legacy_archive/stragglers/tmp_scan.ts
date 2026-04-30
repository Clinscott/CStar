import { runScan } from './src/tools/pennyone/index.js';
import path from 'path';

async function main() {
    console.log('[O.D.I.N.]: "Initializing code scan..."');
    const target = process.cwd();
    await runScan(target);
    console.log('[O.D.I.N.]: "Scan complete. Matrix populated."');
}

main().catch(err => {
    console.error('[O.D.I.N.]: "Scan failed."', err);
    process.exit(1);
});
