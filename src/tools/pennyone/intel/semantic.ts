import { getParser, TreeSitter } from  '../parser.js';
import { crawlRepository } from  '../crawler.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { UndirectedGraph } = require('graphology') as { UndirectedGraph: new () => any };
const louvain = require('graphology-communities-louvain') as (graph: any) => Record<string, number>;

export interface SemanticSymbol {
    name: string;
    kind: string;
    line: number;
    path: string;
}

export interface SemanticFileResult {
    path: string;
    dependencies: string[];
    symbols: any[];
    logic: number;
    cluster?: number;
}

/**
 * PennyOne Semantic Indexer (v2.5)
 * Purpose: Transition from heuristic string matching to symbol-aware dependency resolution.
 * Mandate: Linscott Standard / SCIP Alignment
 */
export class SemanticIndexer {
    private root: string;
    private symbolRegistry: Map<string, Set<string>> = new Map();

    constructor(root: string) {
        this.root = path.resolve(root);
    }

    public async index(manualFiles?: string[]) {
        const files = manualFiles || await crawlRepository(this.root);
        const results: SemanticFileResult[] = [];

        // 1. DEFINITIONS
        for (const file of files) {
            try {
                const symbols = await this.extractDefinitions(file);
                symbols.forEach(s => {
                    if (!this.symbolRegistry.has(s.name)) {
                        this.symbolRegistry.set(s.name, new Set());
                    }
                    this.symbolRegistry.get(s.name)!.add(path.resolve(file));
                });
            } catch {
                // Skip unsupported or unreadable files
            }
        }

        // 2. USAGES & DEPENDENCIES
        const graph = new UndirectedGraph();
        for (const file of files) {
            try {
                const absPath = path.resolve(file);
                if (!graph.hasNode(absPath)) graph.addNode(absPath);

                const data = await this.analyzeSemantically(file);
                results.push(data);

                // Add edges to graph for clustering
                data.dependencies.forEach(dep => {
                    const absDep = path.resolve(dep);
                    if (!graph.hasNode(absDep)) graph.addNode(absDep);
                    if (!graph.hasEdge(absPath, absDep)) {
                        graph.addEdge(absPath, absDep);
                    }
                });
            } catch {
                // Skip
            }
        }

        // 3. COMMUNITY DETECTION (Leiden/Louvain)
        // [Ω] GUNGNIR UPGRADE: Grouping symbols into functional clusters automatically.
        const clusters = louvain(graph);
        results.forEach(res => {
            res.cluster = clusters[res.path];
        });

        return {
            version: '2.5.0-semantic',
            scanned_at: new Date().toISOString(),
            files: results,
            clusters
        };
    }

    public async focusSymbol(filepath: string, symbol_name: string): Promise<string | null> {
        const absPath = path.resolve(filepath);
        let code = '';
        try {
            code = await fs.readFile(absPath, 'utf-8');
        } catch { return null; }

        const { parser, lang, languageName } = await getParser(absPath);
        const tree = parser.parse(code);

        // Define patterns that capture the ENTIRE definition node, not just the name
        const patterns = languageName === 'python'
            ? [
                '(function_definition name: (identifier) @name) @symbol',
                '(class_definition name: (identifier) @name) @symbol'
              ]
            : [
                '(variable_declarator name: (identifier) @name) @symbol',
                '(function_declaration name: (identifier) @name) @symbol',
                '(class_declaration name: (identifier) @name) @symbol',
                '(interface_declaration name: (type_identifier) @name) @symbol',
                '(lexical_declaration (variable_declarator name: (identifier) @name) @symbol)',
                '(export_statement declaration: (function_declaration name: (identifier) @name) @symbol)',
                '(export_statement declaration: (class_declaration name: (identifier) @name) @symbol)'
              ];

        if (!tree) return null;
        for (const p of patterns) {
            try {
                const query = new TreeSitter.Query(lang, p);
                const matches = query.matches(tree.rootNode);
                for (const m of matches) {
                    const nameCapture = m.captures.find(c => c.name === 'name');
                    const symbolCapture = m.captures.find(c => c.name === 'symbol');

                    if (nameCapture && nameCapture.node.text === symbol_name && symbolCapture) {
                        return symbolCapture.node.text;
                    }
                }
            } catch (e) {
                // console.error(`Query error for pattern ${p}:`, e);
            }
        }
        return null;
    }

    private async extractDefinitions(filepath: string): Promise<SemanticSymbol[]> {
        const absPath = path.resolve(filepath);
        let code = '';
        try {
            code = await fs.readFile(absPath, 'utf-8');
        } catch { return []; }

        const { parser, lang, languageName } = await getParser(absPath);
        const tree = parser.parse(code);

        const symbols: SemanticSymbol[] = [];
        const patterns = languageName === 'python'
            ? ['(function_definition name: (identifier) @name)', '(class_definition name: (identifier) @name)']
            : [
                '(variable_declarator name: (identifier) @name)',
                '(function_declaration name: (identifier) @name)',
                '(class_declaration name: (identifier) @name)',
                '(interface_declaration name: (type_identifier) @name)'
            ];

        if (!tree) return [];
        for (const p of patterns) {
            try {
                const query = new TreeSitter.Query(lang, p);
                const matches = query.matches(tree.rootNode);
                matches.forEach(m => {
                    m.captures.forEach(c => {
                        symbols.push({
                            name: c.node.text,
                            kind: c.node.type,
                            line: c.node.startPosition.row,
                            path: absPath
                        });
                    });
                });
            } catch { }
        }
        return symbols;
    }

    private async analyzeSemantically(filepath: string) {
        const absPath = path.resolve(filepath);
        const code = await fs.readFile(absPath, 'utf-8');
        const { parser } = await getParser(absPath);
        const tree = parser.parse(code);

        const dependencies = new Set<string>();
        const symbolsOccurred: any[] = [];

        if (!tree) return { path: absPath, dependencies: [], symbols: [], logic: 10 };
        const stack = [tree.rootNode];

        while (stack.length > 0) {
            const node = stack.pop();
            if (!node) continue;

            if (node.text && node.childCount === 0) {
                const paths = this.symbolRegistry.get(node.text);
                if (paths) {
                    paths.forEach(p => {
                        if (p !== absPath) {
                            dependencies.add(p);
                            symbolsOccurred.push({ name: node.text, target: p, line: node.startPosition.row });
                        }
                    });
                }
            }

            for (let i = node.childCount - 1; i >= 0; i--) {
                const child = node.child(i);
                if (child) stack.push(child);
            }
        }

        return {
            path: absPath,
            dependencies: Array.from(dependencies),
            symbols: symbolsOccurred,
            logic: Math.max(0, Math.min(10, 10 - (symbolsOccurred.length / 20)))
        };
    }
}
