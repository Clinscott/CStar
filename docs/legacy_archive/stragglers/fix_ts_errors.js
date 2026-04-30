import fs from 'fs';

function fixFile(filePath, fixes) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        for (const fix of fixes) {
            content = content.replace(fix.search, fix.replace);
        }
        fs.writeFileSync(filePath, content);
        console.log(`Fixed ${filePath}`);
    } catch (e) {
        console.error(`Failed to fix ${filePath}: ${e}`);
    }
}

// crawler.ts
fixFile('src/tools/pennyone/crawler.ts', [
    { search: /\* @param targetPath/, replace: '* @param {string} targetPath - Path to crawl\n * @returns {Promise<string[]>} File paths' }
]);

// index.ts
fixFile('src/tools/pennyone/index.ts', [
    { search: /import \{ defaultProvider \} from '\.\/intel\/llm\.js';\r?\n/, replace: '' },
    { search: /\* @param targetPath/, replace: '* @param {string} targetPath - Target path\n * @returns {Promise<FileData[]>} Scanned files' },
    { search: /catch \(e\)/g, replace: 'catch' },
    { search: /const hashMap = new Map<string, any>\(\);/, replace: '// eslint-disable-next-line @typescript-eslint/no-explicit-any\n    const hashMap = new Map<string, any>();' }
]);

// intel/compiler.ts
fixFile('src/tools/pennyone/intel/compiler.ts', [
    { search: /\* Purpose: Compile all FileData into a master JSON graph with resolved dependencies\./, replace: '* Purpose: Compile all FileData into a master JSON graph with resolved dependencies.\n * @param {FileData[]} results - The analysis results\n * @param {string} targetRepo - The target repository path\n * @returns {Promise<string>} Path to the generated graph' },
    { search: / \* Helper to resolve an import path to an absolute file path known by the scan\./, replace: ' * Helper to resolve an import path to an absolute file path known by the scan.\n     * @param {string} sourceFile - The source file\n     * @param {string} importPath - The import path\n     * @returns {string | null} The absolute path or null' }
]);

// intel/database.ts
fixFile('src/tools/pennyone/intel/database.ts', [
    { search: /\* Registers a spoke in the database if it doesn't exist\./, replace: '* Registers a spoke in the database if it doesn\'t exist.\n * @param {string} targetRepo - The target repository path\n * @returns {number} The spoke ID' },
    { search: /\* Persists an AgentPing to the SQLite database\./, replace: '* Persists an AgentPing to the SQLite database.\n * @param {AgentPing} ping - The ping object\n * @param {string} targetRepo - The target repository path' },
    { search: / \* \[O\.D\.I\.N\.\]: "Retrieving the scrolls of past campaigns\."/, replace: ' * [O.D.I.N.]: "Retrieving the scrolls of past campaigns."\n * @param {string} targetRepo - The target repository path\n * @returns {any[]} The session summaries' },
    { search: /\* Retrieves all pings for a specific session in chronological order\./, replace: '* Retrieves all pings for a specific session in chronological order.\n * @param {number} sessionId - The session ID\n * @param {string} targetRepo - The target repository path\n * @returns {AgentPing[]} The pings' },
    { search: /export function getDb\(targetRepo: string\): Database\.Database \{/, replace: '// eslint-disable-next-line @typescript-eslint/no-unused-vars\nexport function getDb(_targetRepo: string): Database.Database {' },
    { search: /as any\[\];/, replace: 'as unknown[];' }
]);

// intel/git_trainer.ts
fixFile('src/tools/pennyone/intel/git_trainer.ts', [
    { search: /catch \(err: any\)/, replace: 'catch (err)' }
]);

// intel/gravity_db.ts
fixFile('src/tools/pennyone/intel/gravity_db.ts', [
    { search: /export function getFileGravity\(filepath: string\): number \{/, replace: '/**\n * @param {string} filepath\n * @returns {number}\n */\nexport function getFileGravity(filepath: string): number {' },
    { search: /catch \(e\) \{ \/\* ignore \*\//, replace: 'catch { /* ignore */' },
    { search: /export function updateFileGravity\(filepath: string, weight: number\): void \{/, replace: '/**\n * @param {string} filepath\n * @param {number} weight\n */\nexport function updateFileGravity(filepath: string, weight: number): void {' },
    { search: /export function setFileGravity\(filepath: string, weight: number\): void \{/, replace: '/**\n * @param {string} filepath\n * @param {number} weight\n */\nexport function setFileGravity(filepath: string, weight: number): void {' }
]);

// intel/llm.ts
fixFile('src/tools/pennyone/intel/llm.ts', [
    { search: /getIntent\(code: string, data: FileData\)/, replace: 'getIntent(_code: string, _data: FileData)' },
    { search: /getIntent\(code: string, data: FileData\)/g, replace: 'getIntent(_code: string, _data: FileData)' },
    { search: /const filename = data\.path/, replace: 'const filename = _data.path' },
    { search: /if \(data\.path/g, replace: 'if (_data.path' },
    { search: /data\.exports/g, replace: '_data.exports' },
    { search: /data\.complexity/g, replace: '_data.complexity' },
    { search: /if \(code\.includes/g, replace: 'if (_code.includes' },
    { search: /\/\[\\\\\\\/\]\//, replace: '/[\\\\/]/' },
    { search: /mock\.getIntent\(code, data\)/, replace: 'mock.getIntent(_code, _data)' }
]);

// intel/writer.ts
fixFile('src/tools/pennyone/intel/writer.ts', [
    { search: /\* Purpose: Generate Quarto reports in a flattened \.stats\/ directory\./, replace: '* Purpose: Generate Quarto reports in a flattened .stats/ directory.\n * @param {FileData} file - The file data\n * @param {string} targetRepo - The target repository path\n * @param {string} code - The source code\n * @returns {Promise<{ qmdPath: string, intent: string }>} Path and intent' },
    { search: /replace\(\/\[\\\/\\\\\]\/g, '-'\)/, replace: 'replace(/[\\\\/]/g, \'-\')' }
]);

// live/recorder.ts
fixFile('src/tools/pennyone/live/recorder.ts', [
    { search: /import fs from 'fs\/promises';\r?\n/, replace: '' },
    { search: /import path from 'path';\r?\n/, replace: '' },
    { search: /\* Record a ping to the chronological session ledger \(SQLite\)\./, replace: '* Record a ping to the chronological session ledger (SQLite).\n * @param {AgentPing} ping - The ping object\n * @param {string} targetRepo - The target repository path' }
]);

// live/search.ts
fixFile('src/tools/pennyone/live/search.ts', [
    { search: /export async function searchMatrix\(query: string, targetPath: string = '\.'\) \{/, replace: '/**\n * @param {string} query\n * @param {string} [targetPath]\n */\n// eslint-disable-next-line @typescript-eslint/no-unused-vars\nexport async function searchMatrix(query: string, targetPath: string = \'.\') {' },
    { search: /\} catch \(err\) \{/, replace: '} catch {' }
]);

// live/socket.ts
fixFile('src/tools/pennyone/live/socket.ts', [
    { search: /\* Start a chronological playback of an old session\./, replace: '* Start a chronological playback of an old session.\n     * @param {unknown[]} pings - Pings to play back\n     * @param {number} speed - Playback speed\n     */' },
    { search: /public async startPlayback\(pings: any\[\], speed: number = 2\.0\) \{/, replace: 'public async startPlayback(pings: unknown[], speed = 2.0) {' },
    { search: /\* Broadcast a message to all connected visualizers/, replace: '* Broadcast a message to all connected visualizers\n     * @param {"NODE_UPDATED" | "GRAPH_REBUILT" | "AGENT_TRACE"} type - Event type\n     * @param {unknown} payload - Event payload\n     */' },
    { search: /public broadcast\(type: 'NODE_UPDATED' | 'GRAPH_REBUILT' | 'AGENT_TRACE', payload: any\) \{/, replace: 'public broadcast(type: \'NODE_UPDATED\' | \'GRAPH_REBUILT\' | \'AGENT_TRACE\', payload: unknown) {' },
    { search: /const ping = pings\[i\];/, replace: 'const ping = pings[i] as { timestamp: number };' },
    { search: /const nextPing = pings\[i \+ 1\];/, replace: 'const nextPing = pings[i + 1] as { timestamp: number };' }
]);

// live/telemetry.ts
fixFile('src/tools/pennyone/live/telemetry.ts', [
    { search: /\* Sanitize incoming paths to match matrix-graph\.json format \(Forward-slash absolute\)\./, replace: '* Sanitize incoming paths to match matrix-graph.json format.\n * @param {string} p - The path\n * @returns {string} The normalized path' },
    { search: /export async function handleTelemetryPing\(req: Request, res: Response, relay: SubspaceRelay, targetRepo: string\) \{/, replace: '/**\n * @param {Request} req\n * @param {Response} res\n * @param {SubspaceRelay} relay\n * @param {string} targetRepo\n */\nexport async function handleTelemetryPing(req: Request, res: Response, relay: SubspaceRelay, targetRepo: string) {' }
]);

// live/watcher.ts
fixFile('src/tools/pennyone/live/watcher.ts', [
    { search: /import fs from 'fs\/promises';\r?\n/, replace: '' },
    { search: /\* RepositoryWatcher: Monitors files and triggers delta analysis/, replace: '* RepositoryWatcher: Monitors files and triggers delta analysis\n * @param {string} targetPath - The path to watch\n * @param {SubspaceRelay} relay - The relay for broadcasting\n * @returns {chokidar.FSWatcher} The watcher instance' },
    { search: /ignored: \/\[\\\\\/\\\\\]/, replace: 'ignored: /(^|[\\\\/])\\../' }
]);

// parser.ts
fixFile('src/tools/pennyone/parser.ts', [
    { search: /export async function initParsers\(\) \{/, replace: '/**\n * Initialize parsers\n */\nexport async function initParsers() {' },
    { search: /export async function getParser\(filepath: string\)/, replace: '/**\n * Get parser for filepath\n * @param {string} filepath\n * @returns {Promise<any>}\n */\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport async function getParser(filepath: string)' },
    { search: /\/\/ @ts-ignore/g, replace: '// @ts-expect-error' },
    { search: /\* Standard entry point for analysis/, replace: '* Standard entry point for analysis\n * @param {string} code\n * @param {string} filepath\n * @returns {Promise<any>}' }
]);

// pathRegistry.ts
fixFile('src/tools/pennyone/pathRegistry.ts', [
    { search: /\* The PathRegistry enforces strict workspace boundaries\./, replace: '* The PathRegistry enforces strict workspace boundaries.\n * @returns {PathRegistry} The singleton instance' },
    { search: /\} catch \(error\) \{ return null; \}/, replace: '} catch { return null; }' },
    { search: /\* Re-anchor a broken relative path using the ascension tree/, replace: '* Re-anchor a broken relative path using the ascension tree\n     * @param {string} sourceFile - The source file\n     * @param {string} relativePath - The relative path\n     * @returns {string} The resolved absolute path' },
    { search: /\* Returns a repo-relative path that is cleanly formatted/, replace: '* Returns a repo-relative path that is cleanly formatted\n     * @param {string} p - The absolute path\n     * @returns {string} The relative path' },
    { search: /\* Forcefully converts any Windows-style paths into Linux-style forward slashes/, replace: '* Forcefully converts any Windows-style paths into Linux-style forward slashes\n     * @param {string} p - The path\n     * @returns {string} The normalized path' }
]);

// types.ts
fixFile('src/tools/pennyone/types.ts', [
    { search: /export interface AgentPing \{/, replace: '/**\n * AgentPing definition\n */\nexport interface AgentPing {' }
]);

console.log('Script execution complete.');
