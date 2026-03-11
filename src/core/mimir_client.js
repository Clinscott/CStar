const { execSync } = require('child_process');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

exports.mimir = {
    think: async (query) => {
        try {
            const cmd = `python "${path.join(PROJECT_ROOT, 'src/core/mimir_client.py')}" "${query.replace(/"/g, '\\"')}"`;
            const result = execSync(cmd, { encoding: 'utf-8', env: { ...process.env, GEMINI_CLI_ACTIVE: 'true' } });
            return result.trim();
        } catch (e) {
            return 'Link Offline';
        }
    },
    get_file_intent: async (filepath) => {
        return await exports.mimir.think(`What is the intent of sector: ${filepath}?`);
    },
    close: async () => {}
};
