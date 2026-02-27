import { analyzeFile } from './src/tools/pennyone/analyzer.js';
import fs from 'fs/promises';
import path from 'path';

async function test() {
    const target = 'src/tools/pennyone/index.ts';
    const code = await fs.readFile(target, 'utf-8');
    const data = await analyzeFile(code, target);
    console.log('--- Analyze Result for', target, '---');
    console.log('Imports:', JSON.stringify(data.imports, null, 2));
    console.log('Exports:', JSON.stringify(data.exports, null, 2));
}

test().catch(console.error);
