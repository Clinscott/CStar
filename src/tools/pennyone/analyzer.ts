import { getParser, TreeSitter } from './parser.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { calculateLogicScore } from './calculus/logic.js';
import { calculateStyleScore } from './calculus/style.js';
import { calculateIntelScore } from './calculus/intel.js';

export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
    gravity: number;
}

export interface FileData {
    path: string;
    loc: number;
    complexity: number;
    matrix: GungnirMatrix;
    imports: { source: string; local: string; imported: string }[];
    exports: string[];
    intent?: string;
    hash: string;
    endpoints?: string[];
    is_api?: boolean;
    cachedDependencies?: string[];
}

export async function analyzeFile(code: string, filepath: string): Promise<FileData> {
    const loc = calculateLOC(code, filepath);
    const hash = crypto.createHash('md5').update(code).digest('hex');
    
    const endpoints = detectEndpoints(code, filepath);
    const isApi = endpoints.length > 0;

    if (filepath.endsWith('.md') || filepath.endsWith('.qmd')) {
        const docResult = analyzeMarkdown(code, filepath, hash, loc);
        const gravity = await getFileGravity(filepath);
        docResult.matrix.gravity = gravity;
        return { ...docResult, endpoints, is_api: isApi };
    }

    const { parser, lang, languageName } = await getParser(filepath);
    const tree = parser.parse(code);

    let complexity = 1;
    let maxNesting = 0;
    const imports: FileData['imports'] = [];
    const exports: string[] = [];

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
    } catch (e) {}

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
        const jsQuery = new TreeSitter.Query(lang, `
            (import_statement) @import
            (export_statement) @export
            (lexical_declaration) @export
            (variable_declaration) @export
            (function_declaration) @func
            (class_declaration) @class
        `);
        const jsMatches = jsQuery.matches(tree.rootNode);
        jsMatches.forEach((m: any) => {
            m.captures.forEach((c: any) => {
                const node = c.node;
                if (c.name === 'import') {
                    const sourceNodes = node.descendantsOfType('string');
                    if (sourceNodes.length > 0) {
                        const src = sourceNodes[0].text.replace(/['"]/g, '');
                        const specifiers = node.descendantsOfType('import_specifier');
                        if (specifiers.length > 0) {
                            specifiers.forEach((s: any) => {
                                const importedNode = s.childForFieldName('name');
                                const aliasNode = s.childForFieldName('alias');
                                const imported = importedNode ? importedNode.text : s.text;
                                const local = aliasNode ? aliasNode.text : imported;
                                imports.push({ source: src, local, imported });
                            });
                        } else {
                            imports.push({ source: src, local: '*', imported: '*' });
                        }
                    }
                } else if (c.name === 'func' || c.name === 'class' || c.name === 'export') {
                    const idNode = node.childForFieldName ? node.childForFieldName('name') : null;
                    if (idNode) {
                        exports.push(idNode.text);
                    } else {
                        // Support for const/let exports
                        const idNodes = node.descendantsOfType('identifier');
                        if (idNodes.length > 0) {
                            const filtered = idNodes.filter((id: any) => !['const', 'let', 'var', 'async', 'function', 'class'].includes(id.text));
                            if (filtered.length > 0) exports.push(filtered[0].text);
                        }
                    }
                }
            });
        });
    }

    const logicValue = calculateLogicScore(complexity, maxNesting, loc);
    const style = calculateStyleScore(code);
    const intel = calculateIntelScore(code, loc);
    const gravity = await getFileGravity(filepath);
    const anomalyScore = await getSystemAnomaly();

    const penalty = (gravity > 10 ? 0.5 : 0) + (anomalyScore * 1.5);
    const overall = Math.min(Math.max(((logicValue + style + intel) / 3) - penalty, 1), 10);

    return {
        path: filepath,
        loc,
        complexity,
        matrix: { logic: logicValue, style, intel, overall, gravity },
        imports,
        exports,
        intent: undefined,
        hash,
        endpoints,
        is_api: isApi
    };
}

function detectEndpoints(code: string, filepath: string): string[] {
    const endpoints: string[] = [];
    const routeRegex = /\.(get|post|put|delete|patch)(?:<.*?>)?\s*\(\s*['"](\/.*?)['"]/g;
    const nextJsRegex = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/g;
    const fastapiRegex = /@.*?\.(get|post|put|delete|patch)\s*\(\s*['"](\/.*?)['"]/g;

    routeRegex.lastIndex = 0;
    nextJsRegex.lastIndex = 0;
    fastapiRegex.lastIndex = 0;

    let match;
    while ((match = routeRegex.exec(code)) !== null) endpoints.push(`[${match[1].toUpperCase()}] ${match[2]}`);
    while ((match = nextJsRegex.exec(code)) !== null) {
        const rel = filepath.replace(/.*\/app\//, '/').replace(/\/route\.(ts|js)$/, '');
        endpoints.push(`[${match[1]}] ${rel}`);
    }
    while ((match = fastapiRegex.exec(code)) !== null) endpoints.push(`[${match[1].toUpperCase()}] ${match[2]}`);

    return [...new Set(endpoints)];
}

async function getSystemAnomaly(): Promise<number> {
    const statePath = path.join(process.cwd(), '.agent', 'sovereign_state.json');
    try {
        const raw = await fs.readFile(statePath, 'utf-8');
        const data = JSON.parse(raw);
        return data.last_anomaly_score || 0;
    } catch (e) { return 0; }
}

async function getFileGravity(filepath: string): Promise<number> {
    const gravityPath = path.join(process.cwd(), '.stats', 'gravity.json');
    try {
        const raw = await fs.readFile(gravityPath, 'utf-8');
        const data = JSON.parse(raw);
        const normalized = filepath.replace(/\\/g, '/');
        return data[normalized] || 0;
    } catch (e) { return 0; }
}

function analyzeMarkdown(code: string, filepath: string, hash: string, loc: number): FileData {
    const imports: FileData['imports'] = [];
    const exports: string[] = [];
    const linkRegex = /\[.*?\]\((.*?\.md|.*?\.qmd)\)/g;
    let match;
    while ((match = linkRegex.exec(code)) !== null) imports.push({ source: match[1], local: '*', imported: '*' });
    const nameMatch = code.match(/^name:\s*['"]?([\w-]+)['"]?/m);
    if (nameMatch) exports.push(nameMatch[1]);

    return {
        path: filepath, loc, complexity: 1, 
        matrix: { logic: 10, style: 10, intel: 10, overall: 10, gravity: 0 },
        imports, exports, intent: undefined, hash
    };
}

function calculateLOC(code: string, filepath: string): number {
    const isPython = filepath.endsWith('.py');
    const commentRegex = isPython ? /(?<!:)#/ : /(?<!:)\/\//;
    let cleanCode = isPython ? code.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '') : code.replace(/\/\*[\s\S]*?\*\//g, '');
    return cleanCode.split('\n').map(line => {
        const content = line.split(commentRegex)[0];
        return content ? content.trim() : '';
    }).filter(line => line.length > 0).length;
}
