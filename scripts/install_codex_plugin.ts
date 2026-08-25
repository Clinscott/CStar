import { installCodexPlugin } from '../src/packaging/installers.js';

const projectRoot = process.cwd();
const result = installCodexPlugin({ projectRoot });

console.log('[corvus:codex] Staged verified local Codex plugin source.');
console.log(`- plugin: ${result.pluginPath}`);
console.log(`- marketplace: ${result.marketplacePath}`);
console.log('- activation: not performed; codex plugin add, cache refresh, restart/new-task pickup, and live proof remain operator-gated');
