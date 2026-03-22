import fs from 'fs';

function fixFile(filePath, fixes) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        for (const fix of fixes) {
            content = content.replace(fix.search, fix.replace);
        }
        fs.writeFileSync(filePath, content);
    } catch (e) {
        console.error(e);
    }
}

// index.ts _error unused
fixFile('src/tools/pennyone/index.ts', [
    { search: /catch \(_error\)/g, replace: 'catch' }
]);

// database.ts unused args
fixFile('src/tools/pennyone/intel/database.ts', [
    { search: /export function getDb\(_targetRepo: string\)/g, replace: 'export function getDb(_targetRepo?: string)' }
]);

// git_trainer.ts unused err
fixFile('src/tools/pennyone/intel/git_trainer.ts', [
    { search: /catch \(_err\)/g, replace: 'catch' }
]);

// gravity_db.ts descriptions
fixFile('src/tools/pennyone/intel/gravity_db.ts', [
    { search: /\/\*\*\n \*\//g, replace: '/**\n * @returns {Database.Database} The gravity db\n */' }
]);

// recorder.ts unused err
fixFile('src/tools/pennyone/live/recorder.ts', [
    { search: /catch \(_err\)/g, replace: 'catch' }
]);

// search.ts unused args
fixFile('src/tools/pennyone/live/search.ts', [
    { search: /export async function searchMatrix\(query: string, targetPath/g, replace: 'export async function searchMatrix(query: string, _targetPath' }
]);

// socket.ts dangling */
fixFile('src/tools/pennyone/live/socket.ts', [
    { search: /\n\n     \*\/\n    public/g, replace: '\n    public' }
]);

// watcher.ts unused err
fixFile('src/tools/pennyone/live/watcher.ts', [
    { search: /catch \(_err\)/g, replace: 'catch' }
]);

// parser.ts unused assignments, missing tags
fixFile('src/tools/pennyone/parser.ts', [
    { search: /let langPath = '';\n    let languageName = '';/g, replace: '' },
    { search: /langPath =/g, replace: 'const langPath =' },
    { search: /languageName =/g, replace: 'const languageName =' },
    { search: /\/\*\*\n \* Standard entry point for analysis\n \* @param \{string\} code - Code\n \* @param \{string\} filepath - Path\n \* @returns \{Promise<any>\} Result\n \*\//g, replace: '/**\n * Standard entry point for analysis\n * @param {string} code - Code string\n * @param {string} filepath - Path string\n * @returns {Promise<any>} Result Tree\n */' }
]);

// pathRegistry.ts parameter descriptions
fixFile('src/tools/pennyone/pathRegistry.ts', [
    { search: /\/\*\*\n \* Standardize a path to forward-slash absolute format\.\n \* @param p\n \*\//, replace: '/**\n * Standardize a path to forward-slash absolute format.\n * @param {string} p - Path\n * @returns {string} Normalized path\n */' },
    { search: /\/\*\*\n \* Resolve a relative path from a source file\.\n \* @param sourceFile\n \* @param relativePath\n \*\//, replace: '/**\n * Resolve a relative path from a source file.\n * @param {string} sourceFile - Source\n * @param {string} relativePath - Relative\n * @returns {string} Resolved path\n */' },
    { search: /\/\*\*\n \* Get the relative path from the project root\.\n \* @param p\n \*\//, replace: '/**\n * Get the relative path from the project root.\n * @param {string} p - Path\n * @returns {string} Relative path\n */' }
]);

// types.ts trace event
fixFile('src/tools/pennyone/types.ts', [
    { search: /payload: any;/g, replace: 'payload: unknown;' }
]);

console.log('Final 20 squash complete.');
