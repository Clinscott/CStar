import { getParser, TreeSitter } from './parser.js';

export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
}

export interface FileData {
    path: string;
    loc: number;
    complexity: number;
    matrix: GungnirMatrix;
    imports: { source: string; local: string; imported: string }[];
    exports: string[];
    intent?: string;
}

/**
 * [ALFRED]: "I have refined the analysis engine to be polyglot, sir. 
 * We now observe both the JS sectors and the Python backend with equal clarity."
 */
export async function analyzeFile(code: string, filepath: string): Promise<FileData> {
    const loc = calculateLOC(code, filepath);
    const { parser, lang, languageName } = await getParser(filepath);
    const tree = parser.parse(code);

    let complexity = 1;
    let maxNesting = 0;
    const imports: FileData['imports'] = [];
    const exports: string[] = [];

    // 1. Complexity & Nesting
    let complexityQuerySource = '';
    if (languageName === 'python') {
        complexityQuerySource = `
            (if_statement) @c
            (for_statement) @c
            (while_statement) @c
        `;
    } else {
        complexityQuerySource = `
            (if_statement) @c
            (for_statement) @c
            (while_statement) @c
            (ternary_expression) @c
            (catch_clause) @c
            (switch_case) @c
        `;
    }

    try {
        const complexityQuery = new TreeSitter.Query(lang, complexityQuerySource);
        const matches = complexityQuery.matches(tree.rootNode);
        complexity += matches.length;
    } catch (e) {
        // Query error ignored for robustness
    }

    const traverse = (node: any, depth: number) => {
        if (node.type === 'statement_block' || node.type === 'block' || node.type === 'suite') {
            depth++;
            if (depth > maxNesting) maxNesting = depth;
        }
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) traverse(child, depth);
        }
    };
    traverse(tree.rootNode, 0);

    // 2. Language Specific Extraction
    if (languageName === 'python') {
        const pyQuery = new TreeSitter.Query(lang, `
            (import_from_statement module_name: (dotted_name) @module)
            (import_statement name: (dotted_name) @name)
            (function_definition name: (identifier) @func)
            (class_definition name: (identifier) @class)
        `);
        const pyMatches = pyQuery.matches(tree.rootNode);
        pyMatches.forEach((m: any) => {
            m.captures.forEach((c: any) => {
                const node = c.node;
                if (c.name === 'module' || c.name === 'name') {
                    imports.push({ source: node.text, local: node.text, imported: '*' });
                } else {
                    exports.push(node.text);
                }
            });
        });
    } else {
        // JS/TS: Broad patterns to avoid field name mismatches
        const jsQuery = new TreeSitter.Query(lang, `
            (import_statement) @import
            (function_declaration) @func
            (class_declaration) @class
            (export_statement) @export
        `);
        const jsMatches = jsQuery.matches(tree.rootNode);
        jsMatches.forEach((m: any) => {
            m.captures.forEach((c: any) => {
                const node = c.node;
                if (c.name === 'import') {
                    // Primitive source extraction
                    const sourceNode = node.descendantsOfType('string')[0];
                    if (sourceNode) {
                        const src = sourceNode.text.replace(/['"]/g, '');
                        imports.push({ source: src, local: '*', imported: '*' });
                    }
                } else if (c.name === 'func' || c.name === 'class') {
                    // Try to find identifier
                    const idNode = node.childForFieldName ? node.childForFieldName('name') : null;
                    if (idNode) {
                        exports.push(idNode.text);
                    } else {
                        // Fallback: first identifier child
                        const firstId = node.descendantsOfType('identifier')[0];
                        if (firstId) exports.push(firstId.text);
                    }
                }
            });
        });
    }

    const logicValue = Math.min(Math.max(10 - (complexity / Math.max(loc, 1)) * 2, 1), 10);
    const style = 8;
    const intel = 8;
    const overall = (logicValue + style + intel) / 3;

    return {
        path: filepath,
        loc,
        complexity,
        matrix: { logic: logicValue, style, intel, overall },
        imports,
        exports,
        intent: undefined
    };
}

/**
 * Multi-Language LOC calculation
 */
function calculateLOC(code: string, filepath: string): number {
    const isPython = filepath.endsWith('.py');
    const commentRegex = isPython ? /(?<!:)#/ : /(?<!:)\/\//;

    let cleanCode = code;
    if (!isPython) {
        cleanCode = code.replace(/\/\*[\s\S]*?\*\//g, '');
    } else {
        cleanCode = code.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '');
    }

    return cleanCode
        .split('\n')
        .map(line => {
            const content = line.split(commentRegex)[0];
            return content ? content.trim() : '';
        })
        .filter(line => line.length > 0)
        .length;
}
