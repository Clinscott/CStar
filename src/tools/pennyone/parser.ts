export * as TreeSitter from 'web-tree-sitter';
import * as TreeSitter from 'web-tree-sitter';
import path from 'path';
import { registry } from  './pathRegistry.js';

/**
 * [ALFRED]: "The sensors have been upgraded to the WASM standard, sir. 
 * We now observe the polyglot landscape with absolute stability."
 */

let isInitialized = false;
const parsers: Record<string, { parser: TreeSitter.Parser, lang: TreeSitter.Language }> = {};

/**
 * Initialize parsers
 * @returns {Promise<void>} Resolves when initialized
 */
export async function initParsers(): Promise<void> {
    if (isInitialized) return;
    await TreeSitter.Parser.init();
    isInitialized = true;
}

/**
 * Get parser for filepath
 * @param {string} filepath - Path to file to parse
 * @returns {Promise<{ parser: TreeSitter.Parser, lang: TreeSitter.Language, languageName: string }>} Parser configuration object
 */
export async function getParser(filepath: string): Promise<{ parser: TreeSitter.Parser, lang: TreeSitter.Language, languageName: string }> {
    await initParsers();

    const ext = path.extname(filepath).toLowerCase();
    let langPath = '';
    let languageName = '';

    if (ext === '.py') {
        langPath = 'node_modules/tree-sitter-python/tree-sitter-python.wasm';
        languageName = 'python';
    } else if (ext === '.ts' || ext === '.js') {
        langPath = 'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm';
        languageName = 'typescript';
    } else if (ext === '.tsx') {
        langPath = 'node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm';
        languageName = 'tsx';
    } else if (ext === '.js' || ext === '.jsx') {
        langPath = 'node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm';
        languageName = 'javascript';
    } else {
        throw new Error(`Unsupported file type: ${ext}`);
    }

    if (!parsers[languageName]) {
        // [Ω] BIFROST FIX: Resolve WASM paths relative to THIS file to prevent 
        // test isolation from breaking tree-sitter loading.
        const currentDir = import.meta.dirname;
        // From src/tools/pennyone/parser.ts to root is 3 levels up
        const projectRoot = path.resolve(currentDir, '../../..');
        const fullWasmPath = path.resolve(projectRoot, langPath);
        
        const lang = await TreeSitter.Language.load(fullWasmPath);
        const parser = new TreeSitter.Parser();
        parser.setLanguage(lang);
        parsers[languageName] = { parser, lang };
    }

    return { ...parsers[languageName], languageName };
}

/**
 * Standard entry point for analysis
 * @param {string} code
 * @param {string} filepath
 * @returns {Promise<any>}
 */
export async function parseCode(code: string, filepath: string) {
    const { parser } = await getParser(filepath);
    return parser.parse(code);
}


