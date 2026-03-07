import { getParser, TreeSitter } from './parser.ts';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { calculateLogicScore } from './calculus/logic.ts';
import { calculateStyleScore } from './calculus/style.ts';
import { calculateIntelScore } from './calculus/intel.ts';
import { getFileGravity } from './intel/gravity_db.ts';
import { registry } from './pathRegistry.ts';
import { GungnirMatrix, FileData } from './types.ts';

/**
 * Analyzes code and returns FileData
 * @param {string} code - The source code
 * @param {string} filepath - The file path
 * @returns {Promise<FileData>} Promisified FileData
 */
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
    if (!tree) throw new Error(`Failed to parse ${filepath}`);

    let complexity = 1;
    let maxNesting = 0;
    const imports: FileData['imports'] = [];
    const exports: string[] = [];

    let complexityQuerySource: string;
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
    } catch { /* ignore */ }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        pyMatches.forEach((m) => {
            m.captures.forEach((c) => {
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
         
        jsMatches.forEach((m) => {
            m.captures.forEach((c) => {
                const node = c.node;
                if (c.name === 'import') {
                    const sourceNodes = node.descendantsOfType('string');
                    if (sourceNodes.length > 0) {
                        const src = sourceNodes[0].text.replace(/['"]/g, '');
                        const specifiers = node.descendantsOfType('import_specifier');
                        if (specifiers.length > 0) {
                            specifiers.forEach((s) => {
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
                    const specifiers = node.descendantsOfType('export_specifier');
                    if (specifiers.length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        specifiers.forEach((s: any) => {
                            const aliasNode = s.childForFieldName('alias');
                            const nameNode = s.childForFieldName('name');
                            const exported = aliasNode ? aliasNode.text : (nameNode ? nameNode.text : s.text);
                            exports.push(exported);
                        });
                    } else {
                        const idNode = node.childForFieldName ? node.childForFieldName('name') : null;
                        if (idNode) {
                            exports.push(idNode.text);
                        } else {
                            // Support for const/let exports
                            const idNodes = node.descendantsOfType('identifier');
                            if (idNodes.length > 0) {
                                const filtered = idNodes.filter((id) => !['const', 'let', 'var', 'async', 'function', 'class'].includes(id.text));
                                if (filtered.length > 0) exports.push(filtered[0].text);
                            }
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
    const vigilScore = calculateVigilScore(filepath);

    const aesthetic = (logicValue + style + intel) / 3;
    const penalty = (gravity > 10 ? 0.5 : 0) + (anomalyScore * 1.5);
    let overall = Math.min(Math.max(aesthetic - penalty, 1), 10);

    // [🛡️] THE STERLING MANDATE: Cap overall score if Vigil is missing.
    // If we have no unit test or no feature contract, the sector is Tarnished.
    if (vigilScore < 5.0 && gravity > 20) {
        overall = Math.min(overall, 5.0);
    }

    // [Ω] FIRST PRINCIPLES: Deep metrics for Agent/User insight
    const stability = Math.max(0.1, 1.0 - (complexity / 50));
    const coupling = Math.min(1.0, imports.length / 10);
    const sovereignty = overall >= 8.5 ? 1.0 : (overall / 10);

    return {
        path: filepath,
        loc,
        complexity,
        matrix: { 
            logic: logicValue, 
            style, 
            intel, 
            overall, 
            gravity, 
            stability, 
            coupling,
            aesthetic,
            vigil: vigilScore,
            anomaly: anomalyScore,
            sovereignty
        },
        imports,
        exports,
        intent: undefined,
        hash,
        endpoints,
        is_api: isApi
    };
}

/**
 * [🛡️] THE STERLING MANDATE: Vigil Calculus
 * Purpose: Verifies the existence of Unit Tests and Feature Contracts.
 * @param filepath 
 * @returns {number} Vigil Score (0-10)
 */
function calculateVigilScore(filepath: string): number {
    const root = registry.getRoot();
    const absPath = path.resolve(filepath);
    const stem = path.basename(absPath, path.extname(absPath));
    const isPy = absPath.endsWith('.py');
    const isTs = absPath.endsWith('.ts') || absPath.endsWith('.tsx');

    let score = 0;

    // 1. Tier 1: Lore Check (.feature)
    const featurePath = path.join(root, 'tests', 'features', `${stem}.feature`);
    const groupFeaturePath = path.join(root, 'tests', 'features', `${path.basename(path.dirname(absPath))}.feature`);
    
    // Using synchronous checks here for the high-speed scan loop
    const hasLore = fsSync.existsSync(featurePath) || fsSync.existsSync(groupFeaturePath);
    if (hasLore) score += 5;

    // 2. Tier 2: Isolation Check (Unit Test)
    let hasTest = false;
    if (isPy) {
        const testPath = path.join(root, 'tests', 'unit', `test_${stem}.py`);
        hasTest = fsSync.existsSync(testPath);
    } else if (isTs) {
        const testPath = path.join(root, 'tests', 'node', `${stem}.test.ts`);
        const altTestPath = path.join(root, 'tests', 'node', `${path.basename(absPath)}`);
        hasTest = fsSync.existsSync(testPath) || fsSync.existsSync(altTestPath);
    }

    if (hasTest) score += 5;

    return score;
}

/**
 * Detect endpoints in the code
 * @param {string} code - Source code
 * @param {string} filepath - File path
 * @returns {string[]} Endpoints detected
 */
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

/**
 * Get system anomaly from sovereign state
 * @returns {Promise<number>} Anomaly score
 */
async function getSystemAnomaly(): Promise<number> {
    const statePath = path.join(registry.getRoot(), '.agent', 'sovereign_state.json');
    try {
        const raw = await fs.readFile(statePath, 'utf-8');
        const data = JSON.parse(raw);
        return data.last_anomaly_score || 0;
    } catch { return 0; }
}

/**
 * Analyzes markdown documents
 * @param {string} code - Source code
 * @param {string} filepath - Path to file
 * @param {string} hash - File hash
 * @param {number} loc - Lines of code
 * @returns {FileData} Extracted file data
 */
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

/**
 * Calculates Lines of Code (LOC)
 * @param {string} code - Source code
 * @param {string} filepath - File path
 * @returns {number} Lines of code
 */
function calculateLOC(code: string, filepath: string): number {
    const isPython = filepath.endsWith('.py');
    const commentRegex = isPython ? /(?<!:)#/ : /(?<!:)\/\//;
    const cleanCode = isPython ? code.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '') : code.replace(/\/\*[\s\S]*?\*\//g, '');
    return cleanCode.split('\n').map(line => {
        const content = line.split(commentRegex)[0];
        return content ? content.trim() : '';
    }).filter(line => line.length > 0).length;
}

