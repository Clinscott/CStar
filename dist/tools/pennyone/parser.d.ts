export * as TreeSitter from 'web-tree-sitter';
import * as TreeSitter from 'web-tree-sitter';
/**
 * Initialize parsers
 * @returns {Promise<void>}
 */
export declare function initParsers(): Promise<void>;
/**
 * Get parser for filepath
 * @param {string} filepath - Path to file
 * @returns {Promise<{ parser: TreeSitter.Parser, lang: TreeSitter.Language, languageName: string }>} Parser object
 */
export declare function getParser(filepath: string): Promise<{
    parser: TreeSitter.Parser;
    lang: TreeSitter.Language;
    languageName: string;
}>;
/**
 * Standard entry point for analysis
 * @param {string} code
 * @param {string} filepath
 * @returns {Promise<any>}
 */
export declare function parseCode(code: string, filepath: string): Promise<TreeSitter.Tree | null>;
