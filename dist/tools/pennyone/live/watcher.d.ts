import { SubspaceRelay } from './socket.js';
/**
 * RepositoryWatcher: Monitors files and triggers delta analysis
 * @param {string} targetPath - The path to watch
 * @param {SubspaceRelay} relay - The relay for broadcasting
 * @returns {chokidar.FSWatcher} The watcher instance
 */
export declare function startWatcher(targetPath: string, relay: SubspaceRelay): import("chokidar").FSWatcher;
