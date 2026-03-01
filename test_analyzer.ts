
import { crawlRepository } from './src/tools/pennyone/crawler.ts';
import fs from 'fs/promises';
import { analyzeFile } from './src/tools/pennyone/analyzer.ts';

(async () => {
    const files = await crawlRepository('./src');
    let success = 0, failed = 0;
    for (const f of files) {
        try {
            const code = await fs.readFile(f, 'utf8');
            await analyzeFile(code, f);
            success++;
        } catch (e) {
            console.error('Failed on', f, e.message);
            failed++;
        }
    }
    console.log({ success, failed });
})();

