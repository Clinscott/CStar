import { getParser, TreeSitter } from '../parser.js';
import { crawlRepository } from '../crawler.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SemanticSymbol {
    name: string;
    kind: string;
    line: number;
    path: string;
}

/**
 * PennyOne Semantic Indexer (v2.0)
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
        const results = [];

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

        // 2. USAGES
        for (const file of files) {
            try {
                const data = await this.analyzeSemantically(file);
                results.push(data);
            } catch {
                // Skip
            }
        }

        return {
            version: '2.0.0-semantic',
            scanned_at: new Date().toISOString(),
            files: results
        };
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

        const walk = (node: any) => {
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
            for (let i = 0; i < node.childCount; i++) {
                walk(node.child(i));
            }
        };
        walk(tree.rootNode);

        return {
            path: absPath,
            dependencies: Array.from(dependencies),
            symbols: symbolsOccurred,
            logic: Math.max(0, Math.min(10, 10 - (symbolsOccurred.length / 20))) 
        };
    }
}
