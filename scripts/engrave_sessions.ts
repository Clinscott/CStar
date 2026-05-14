import fs from 'node:fs';
import path from 'node:path';
import { database } from '../src/tools/pennyone/intel/database.ts';
import { registry } from '../src/tools/pennyone/pathRegistry.ts';
import crypto from 'node:crypto';
import os from 'node:os';

registry.setRoot(process.env.CSTAR_LAUNCH_CWD || process.cwd());

// 1. Define potential memory directories
const potentialDirs = [
    path.join(registry.getRoot(), '.agents', 'memory'),
    path.join(os.homedir(), '.gemini', 'tmp', 'corvus', 'chats')
];

const geminiMemoryDir = path.join(os.homedir(), '.gemini', 'tmp', 'corvus', 'memory');

let engravedCount = 0;
const repoId = `repo:${registry.getRoot()}`;

// Use the script's own location to find the CStar directory robustly
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const cstarDir = path.resolve(__dirname, '..');

console.log(`[ALFRED] Engraving sessions for ${repoId}`);
console.log(`[ALFRED] Using database: ${path.join(registry.getRoot(), '.stats', 'pennyone.db')}`);

async function engraveSessions() {
    for (const memoryDir of potentialDirs) {
        if (!fs.existsSync(memoryDir)) {
            continue;
        }

        const files: string[] = [];
        const findFilesRecursive = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // Avoid recursion into .agents/memory if it's the root we're already scanning
                    if (entry.name !== '.agents') findFilesRecursive(fullPath);
                } else if (
                    (entry.name.startsWith('session_') && entry.name.endsWith('.json')) || 
                    (entry.name.startsWith('session-') && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl'))) ||
                    (dir !== memoryDir && entry.name.endsWith('.jsonl')) // Also pick up jsonl files in UUID subdirs
                ) {
                    files.push(fullPath);
                }
            }
        };

        findFilesRecursive(memoryDir);

        for (const filePath of files) {
            const file = path.basename(filePath);
            try {
                const stats = fs.statSync(filePath);
                
                // Check if this session is already engraved by looking at metadata
                const existing = database.getDb().prepare(`
                    SELECT memory_id FROM hall_episodic_memory 
                    WHERE metadata_json LIKE ?
                `).get(`%${file}%`);

                if (existing) {
                    if (process.env.CSTAR_DEBUG_LOGS === '1') console.log(`Skipping session ${file}: Already engraved.`);
                    continue;
                }

                // Retry mechanism for empty files (handling race conditions during session end)
                let content = '';
                let retries = 3;
                while (retries > 0) {
                    content = fs.readFileSync(filePath, 'utf-8');
                    if (content.trim()) break;
                    
                    if (process.env.CSTAR_DEBUG_LOGS === '1') console.log(`Session file ${file} appears empty, retrying in 200ms... (${retries} left)`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retries--;
                }

                if (!content.trim()) {
                    if (process.env.CSTAR_DEBUG_LOGS === '1') console.log(`Skipping session ${file}: File is empty after retries.`);
                    continue;
                }

                let sessionEvents: any[] = [];
                if (file.endsWith('.jsonl')) {
                    sessionEvents = content.split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            try {
                                return JSON.parse(line);
                            } catch (e) {
                                if (process.env.CSTAR_DEBUG_LOGS === '1') console.error(`Error parsing JSONL line in ${file}:`, e);
                                return null;
                            }
                        })
                        .filter(ev => ev !== null);
                } else {
                    try {
                        const parsed = JSON.parse(content);
                        sessionEvents = Array.isArray(parsed) ? parsed : [parsed];
                    } catch (e) {
                        if (process.env.CSTAR_DEBUG_LOGS === '1') console.error(`Error parsing JSON in ${file}:`, e);
                        continue;
                    }
                }

                if (sessionEvents.length === 0) {
                    if (process.env.CSTAR_DEBUG_LOGS === '1') console.log(`Skipping session ${file}: No valid events found.`);
                    continue;
                }

            const sessionId = file.replace(/\.(json|jsonl)$/, '');
            const memoryId = `engram_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}_${crypto.randomBytes(4).toString('hex')}`;
            
            let tacticalSummary = `Session: ${sessionId}`;
            let filesTouched: Set<string> = new Set();
            let beadId = `bead_engram_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;

            if (file.startsWith('session-')) {
                let userMessages = 0;
                for (const event of sessionEvents) {
                    if (event.type === 'user' && userMessages < 3) {
                        const text = event.content?.[0]?.text || '';
                        if (text) {
                            tacticalSummary += `\n- User: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`;
                            userMessages++;
                        }
                    }
                    if (event.type === 'tool-use' || event.type === 'call') {
                        const toolCall = event.toolCall || event;
                        const args = toolCall.arguments || toolCall.args;
                        if (args) {
                            if (args.file_path) filesTouched.add(args.file_path);
                            if (args.path) filesTouched.add(args.path);
                            if (args.dir_path) filesTouched.add(args.dir_path);
                        }
                    }
                }
            } else {
                for (const event of sessionEvents) {
                    if (event.task && !tacticalSummary.includes(event.task)) {
                        tacticalSummary += `\n- Task: ${event.task}`;
                    }
                    if (event.target) filesTouched.add(event.target);
                    if (event.bead_id) beadId = event.bead_id;
                }
            }

            const beadStmt = database.getDb().prepare(`
                INSERT OR IGNORE INTO hall_beads (
                    bead_id, repo_id, target_kind, rationale, status, created_at, updated_at
                ) VALUES (?, ?, 'MIGRATION', 'Migrated session memory', 'CLOSED', ?, ?)
            `);
            beadStmt.run(beadId, repoId, stats.birthtimeMs || Date.now(), Date.now());

            const stmt = database.getDb().prepare(`
                INSERT OR REPLACE INTO hall_episodic_memory (
                    memory_id, bead_id, repo_id, tactical_summary, files_touched_json, 
                    successes_json, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                memoryId,
                beadId,
                repoId,
                tacticalSummary.trim(),
                JSON.stringify(Array.from(filesTouched)),
                JSON.stringify([]),
                JSON.stringify({
                    source: file, 
                    source_dir: memoryDir,
                    original_events: sessionEvents.length,
                    file_size: stats.size
                }),
                stats.birthtimeMs || Date.now(),
                Date.now()
            );
            engravedCount++;
            console.log(`Engraved Session ${file} -> ${memoryId}`);

            // 1.5. Trigger Lesson Distillation (The Harvester)
            try {
                const projectRoot = process.env.CSTAR_LAUNCH_CWD || process.cwd();
                
                // We use a separate process to avoid blocking the hook too long.
                console.log(`[ALFRED] Studying session ${memoryId} for lessons learned...`);
                
                // We invoke the cstar binary directly to run the learn command
                const { spawn } = await import('node:child_process');
                const cstarBin = path.join(cstarDir, 'bin', 'cstar.js');
                
                const distillProc = spawn('node', [cstarBin, 'p1', '--learn', memoryId], {
                    cwd: projectRoot,
                    env: { ...process.env, CSTAR_LAUNCH_CWD: projectRoot },
                    stdio: 'ignore', // Run silently in background
                    detached: true
                });
                distillProc.unref(); // Allow the parent to exit
            } catch (distillErr) {
                console.error(`[WARNING] Failed to distill lessons for ${memoryId}:`, distillErr);
            }
        } catch (err) {
            console.error(`Failed to engrave session ${file}:`, err);
        }
    }
}

// --- Part 2: Engrave Gemini CLI Memory System ---
if (fs.existsSync(geminiMemoryDir)) {
    const memoryFiles = fs.readdirSync(geminiMemoryDir).filter(f => f.endsWith('.md') || f.endsWith('.skill'));
    
    for (const file of memoryFiles) {
        const filePath = path.join(geminiMemoryDir, file);
        try {
            const stats = fs.statSync(filePath);
            
            const existing = database.getDb().prepare(`
                SELECT memory_id FROM hall_episodic_memory 
                WHERE metadata_json LIKE ?
            `).get(`%GEMINI_MEMORY_${file}%`);

            if (existing) {
                // Check if the file has changed since last engraving
                // For simplicity, we'll just skip for now, but in a real system we'd check mtime.
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const memoryId = `engram_gemini_memory_${file.replace(/[^a-zA-Z0-9]/g, '_')}_${crypto.randomBytes(4).toString('hex')}`;
            const beadId = `bead_gemini_memory_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;

            const beadStmt = database.getDb().prepare(`
                INSERT OR IGNORE INTO hall_beads (
                    bead_id, repo_id, target_kind, rationale, status, created_at, updated_at
                ) VALUES (?, ?, 'MEMORY_SYSTEM', 'Gemini CLI Memory System Entry', 'CLOSED', ?, ?)
            `);
            beadStmt.run(beadId, repoId, stats.birthtimeMs || Date.now(), Date.now());

            const stmt = database.getDb().prepare(`
                INSERT OR REPLACE INTO hall_episodic_memory (
                    memory_id, bead_id, repo_id, tactical_summary, files_touched_json, 
                    successes_json, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                memoryId,
                beadId,
                repoId,
                `Gemini CLI Memory: ${file}\n\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`,
                JSON.stringify([filePath]),
                JSON.stringify([]),
                JSON.stringify({
                    source: `GEMINI_MEMORY_${file}`,
                    source_path: filePath,
                    file_size: stats.size
                }),
                stats.birthtimeMs || Date.now(),
                Date.now()
            );
            engravedCount++;
            console.log(`Engraved Gemini Memory ${file} -> ${memoryId}`);
        } catch (err) {
            console.error(`Failed to engrave memory file ${file}:`, err);
        }
    }
}

console.log(`Successfully engraved ${engravedCount} items into hall_episodic_memory.`);
}

engraveSessions().catch(err => {
    console.error("Fatal error during engraving:", err);
    process.exit(1);
});
