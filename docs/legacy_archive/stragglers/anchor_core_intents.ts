import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

const highFidelityIntents = [
  {
    path: '/home/morderith/Corvus/CStar/cstar.ts',
    intent: 'Authoritative TypeScript control plane for the Corvus Star CLI, managing built-in weaves and legacy Python routing.',
    protocol: 'Primary dispatch hub for all framework commands and user interactions.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/core/cstar_dispatcher.py',
    intent: 'Legacy command dispatcher for Python-based skills, responsible for environment detection and execution.',
    protocol: 'Routes legacy CLI commands to their respective skill scripts within the Python layer.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/core/sv_engine.py',
    intent: 'Sovereign intent discovery engine utilizing keyword expansion and Gungnir matrix similarity for skill matching.',
    protocol: 'Central component for resolving natural language requests into executable framework capabilities.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/core/vector.py',
    intent: 'Mathematical core for intent vectorization and similarity calculations within the search engine.',
    protocol: 'Provides the computational primitives for mapping user queries to the high-dimensional skill space.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/core/sovereign_hud.py',
    intent: 'Authoritative UI rendering engine for the CLI and TUI, enforcing the framework\'s visual and persona mandates.',
    protocol: 'Governs all visual telemetry output, including box drawing, sparklines, and persona-specific dialogue.'
  }
];

const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO intents_fts (path, intent, interaction_protocol)
    VALUES (?, ?, ?)
`);

for (const item of highFidelityIntents) {
    insertStmt.run(item.path, item.intent, item.protocol);
    console.log(`- High-fidelity intent anchored: ${item.path}`);
}

db.close();
