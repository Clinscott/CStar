import { installCodexPlugin } from '../src/packaging/installers.js';

const projectRoot = process.cwd();
const result = installCodexPlugin({ projectRoot });

console.log('[corvus:codex] Installed local Codex plugin.');
console.log(`- plugin: ${result.pluginPath}`);
console.log(`- marketplace: ${result.marketplacePath}`);
