import { getParser, TreeSitter } from './src/tools/pennyone/parser.js';
import fs from 'fs/promises';

async function debug() {
    const target = 'src/tools/pennyone/vis/components/NeuralGraph.tsx';
    const code = await fs.readFile(target, 'utf-8');
    const { parser, lang } = await getParser(target);
    const tree = parser.parse(code);

    const complexityQuerySource = `
        (if_statement) @c
        (for_statement) @c
    `;

    try {
        const complexityQuery = new TreeSitter.Query(lang, complexityQuerySource);
        const matches = complexityQuery.matches(tree.rootNode);
        console.log(`Found ${matches.length} complexity matches in ${target}`);
        
        // Count manually
        let manualCount = 0;
        const traverse = (node: any) => {
            if (node.type === 'if_statement' || node.type === 'for_statement') {
                manualCount++;
            }
            for (let i = 0; i < node.childCount; i++) {
                traverse(node.child(i));
            }
        };
        traverse(tree.rootNode);
        console.log(`Manual count: ${manualCount}`);

    } catch (e) {
        console.error("Query Error:", e);
    }
}

debug();
