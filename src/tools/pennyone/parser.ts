export * as TreeSitter from 'web-tree-sitter';
import * as TreeSitter from 'web-tree-sitter';
import path from 'path';

/**
 * [ALFRED]: "The sensors have been upgraded to the WASM standard, sir. 
 * We now observe the polyglot landscape with absolute stability."
 */

let isInitialized = false;
const parsers: Record<string, { parser: any, lang: any }> = {};

export async function initParsers() {
    if (isInitialized) return;
    // @ts-ignore
    await TreeSitter.Parser.init();
    isInitialized = true;
}

export async function getParser(filepath: string): Promise<{ parser: any, lang: any, languageName: string }> {
    await initParsers();

    const ext = path.extname(filepath).toLowerCase();
    let langPath = '';
    let languageName = '';

    if (ext === '.py') {
        langPath = 'node_modules/tree-sitter-python/tree-sitter-python.wasm';
        languageName = 'python';
    } else if (ext === '.ts') {
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
        const fullWasmPath = path.resolve(process.cwd(), langPath);
        // @ts-ignore
        const lang = await TreeSitter.Language.load(fullWasmPath);
        // @ts-ignore
        const parser = new TreeSitter.Parser();
        parser.setLanguage(lang);
        parsers[languageName] = { parser, lang };
    }

    return { ...parsers[languageName], languageName };
}

/**
 * Standard entry point for analysis
 */
export async function parseCode(code: string, filepath: string) {
    const { parser } = await getParser(filepath);
    return parser.parse(code);
}
