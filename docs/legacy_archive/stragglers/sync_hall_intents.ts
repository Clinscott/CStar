import Database from 'better-sqlite3';
import { join } from 'node:path';

const synapseDb = new Database('.agents/synapse.db');
const pennyoneDb = new Database('.stats/pennyone.db');

console.log("Harvesting high-fidelity intents from synapse.db...");

const records = synapseDb.prepare("SELECT prompt, response FROM synapse WHERE status = 'COMPLETED'").all();

let totalInjected = 0;

for (const record of records) {
    if (!record.response || record.response.startsWith('[SAMPLING_REQUEST]')) continue;

    try {
        const intents = JSON.parse(record.response);
        if (!Array.isArray(intents)) continue;

        // Parse paths from prompt
        const promptLines = record.prompt.split('\n');
        const paths: string[] = [];
        for (const line of promptLines) {
            const match = line.match(/FILE \d+: '(.+?)'/);
            if (match) paths.push(match[1]);
        }

        if (paths.length !== intents.length) {
            console.warn(`Warning: Path/Intent mismatch in record. Paths: ${paths.length}, Intents: ${intents.length}`);
            // Use the smaller count to avoid errors
            const count = Math.min(paths.length, intents.length);
            for (let i = 0; i < count; i++) {
                pennyoneDb.prepare("INSERT OR REPLACE INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)")
                    .run(paths[i], intents[i].intent, intents[i].interaction);
                totalInjected++;
            }
        } else {
            for (let i = 0; i < paths.length; i++) {
                pennyoneDb.prepare("INSERT OR REPLACE INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)")
                    .run(paths[i], intents[i].intent, intents[i].interaction);
                totalInjected++;
            }
        }
    } catch (e) {
        // Skip malformed JSON
    }
}

// Now sync intents_fts to hall_files summaries
console.log("Synchronizing hall_files with high-fidelity intents...");
pennyoneDb.prepare(`
    UPDATE hall_files
    SET intent_summary = (SELECT intent FROM intents_fts WHERE intents_fts.path = hall_files.path),
        interaction_summary = (SELECT interaction_protocol FROM intents_fts WHERE intents_fts.path = hall_files.path)
    WHERE EXISTS (SELECT 1 FROM intents_fts WHERE intents_fts.path = hall_files.path)
`).run();

console.log(`Synchronization complete. Total high-fidelity intents injected: ${totalInjected}`);

synapseDb.close();
pennyoneDb.close();
