import { installGeminiExtension } from '../src/packaging/installers.js';

const projectRoot = process.cwd();
const result = installGeminiExtension({ projectRoot });

console.log('[corvus:gemini] Installed local Gemini extension link.');
console.log(`- ${result.linkPath}`);
