import { installGeminiExtension } from '../src/packaging/installers.js';

const projectRoot = process.cwd();
const result = installGeminiExtension({ projectRoot });

console.log('[corvus:gemini] Placed local Gemini extension source link.');
console.log(`- ${result.linkPath}`);
console.log('- live pickup and proof are deferred to a new Gemini session');
