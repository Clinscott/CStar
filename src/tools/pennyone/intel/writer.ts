import { FileData } from '../analyzer.js';
import { defaultProvider } from './llm.js';
import fs from 'fs/promises';
import path from 'path';
import { registry } from '../pathRegistry.js';

/**
 * QMD Writer
 * Purpose: Generate Quarto reports in a flattened .stats/ directory.
 * @param {FileData} file - The file data
 * @param {string} targetRepo - The target repository path
 * @param {string} code - The source code
 * @returns {Promise<{ qmdPath: string, intent: string }>} Path and intent
 */
export async function writeReport(file: FileData, targetRepo: string, code: string): Promise<{ qmdPath: string, intent: string }> {
    const statsDir = path.join(registry.getRoot(), '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const intent = await defaultProvider.getIntent(code, file);

    const absoluteRoot = registry.getRoot();
    const absoluteFile = path.resolve(file.path).replace(/\\/g, '/');
    let relativePath = absoluteFile.replace(absoluteRoot, '').replace(/^\//, '');
    relativePath = relativePath.replace(/:/g, '');

    const flattenedName = relativePath.replace(/[\\/]/g, '-').replace(/\./g, '-');
    const qmdPath = path.join(statsDir, `${flattenedName}.qmd`);

    const m = file.matrix;

    const content = `---
title: "${path.basename(file.path)}"
path: "${file.path}"
loc: ${file.loc}
complexity: ${file.complexity}
logic_score: ${m.logic.toFixed(2)}
style_score: ${m.style.toFixed(2)}
intel_score: ${m.intel.toFixed(2)}
overall_score: ${m.overall.toFixed(2)}
---

## Intent
${intent}

## Gungnir Matrix Breakdown
- **Logic [L]**: ${m.logic.toFixed(1)}/10
- **Style [S]**: ${m.style.toFixed(1)}/10
- **Intel [I]**: ${m.intel.toFixed(1)}/10
- **Gravity [G]**: ${m.gravity} interactions (Agent Activity Hotspot)

${file.endpoints && file.endpoints.length > 0 ? `## ⛩️ API Gateways\n${file.endpoints.map(e => `- \`${e}\``).join('\n')}\n` : ''}

## Neural Pathways

### Imports
${file.imports.length > 0 ? file.imports.map(i => `- [${i.local}](file://${i.source})`).join('\n') : 'Minimal internal dependencies.'}

### Exports
${file.exports.length > 0 ? file.exports.map(e => `- \`${e}\``).join('\n') : 'Internal logic only.'}
`;

    await fs.writeFile(qmdPath, content, 'utf-8');
    return { qmdPath, intent };
}
