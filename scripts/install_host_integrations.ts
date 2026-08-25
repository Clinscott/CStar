import { installCodexPlugin, installGeminiExtension } from '../src/packaging/installers.js';

const projectRoot = process.cwd();

const gemini = installGeminiExtension({ projectRoot });
const codex = installCodexPlugin({ projectRoot });

console.log('[corvus:hosts] Installed local host integrations.');
console.log(`- gemini: ${gemini.linkPath}`);
console.log(`- codex plugin: ${codex.pluginPath}`);
console.log(`- codex marketplace: ${codex.marketplacePath}`);
