import { getDb } from '../src/tools/pennyone/intel/database.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

/**
 * [ALFRED]: "Consulting the monolith for sector instability, sir."
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');

async function runAnalytics() {
    const db = getDb(PROJECT_ROOT);

    // 0. List Active Spokes
    const spokes = db.prepare('SELECT * FROM spokes').all() as any[];
    
    console.log(chalk.cyan('\n ◤ GUNGNIR ANALYTICS: THE WHEEL ◢ '));
    console.log(chalk.cyan(' ' + '━'.repeat(45)));

    // 0. Hall of Lessons
    const totalLessons = db.prepare('SELECT COUNT(*) as count FROM hall_lessons').get() as any;
    const unstudied = db.prepare(`
        SELECT COUNT(*) as count 
        FROM hall_episodic_memory 
        WHERE memory_id NOT IN (SELECT DISTINCT memory_id FROM hall_lessons WHERE memory_id IS NOT NULL)
    `).get() as any;

    console.log(chalk.bold('\n   📚 HALL OF LESSONS'));
    console.log(`   ◈ Total Knowledge Nodes: ${chalk.green(totalLessons.count)}`);
    console.log(`   ◈ Unstudied Engrams: ${chalk.yellow(unstudied.count)}`);
    if (unstudied.count > 0) {
        console.log(chalk.dim('     Run \'cstar p1 --harvest\' to study unstudied engrams.'));
    }

    if (spokes.length === 0) {
        console.log(chalk.yellow(' [INFO] No active spokes registered in the Hall of Records.'));
        console.log(chalk.dim(' Run a scan on a spoke to register it.\n'));
        return;
    }

    for (const spoke of spokes) {
        console.log(chalk.bgBlue.white.bold(`\n ◤ SPOKE: ${spoke.name.toUpperCase()} ◢ `));
        console.log(chalk.dim(` Path: ${spoke.root_path}`));

        // 1. Identify "High Gravity" Hotspots for this spoke
        const hotspots = db.prepare(`
            SELECT target_path, COUNT(*) as interactions, COUNT(DISTINCT session_id) as sessions
            FROM pings p
            JOIN sessions s ON p.session_id = s.id
            WHERE s.spoke_id = ?
            GROUP BY target_path
            ORDER BY interactions DESC
            LIMIT 3
        `).all(spoke.id) as any[];

        if (hotspots.length > 0) {
            console.log(chalk.bold('\n   🔥 TOP GRAVITY WELLS'));
            hotspots.forEach(h => {
                console.log(`   ◈ ${chalk.blue(h.target_path.replace(spoke.root_path, ''))}`);
                console.log(`     ${chalk.white(h.interactions)} interactions across ${chalk.white(h.sessions)} sessions.`);
            });
        }

        // 2. Identify "Logic Loops" for this spoke
        const loops = db.prepare(`
            SELECT target_path, 
                   SUM(CASE WHEN action = 'THINK' THEN 1 ELSE 0 END) as think_count,
                   SUM(CASE WHEN action = 'EDIT' THEN 1 ELSE 0 END) as edit_count
            FROM pings p
            JOIN sessions s ON p.session_id = s.id
            WHERE s.spoke_id = ?
            GROUP BY target_path
            HAVING think_count > 3
            ORDER BY (CAST(think_count AS FLOAT) / MAX(edit_count, 1)) DESC
            LIMIT 3
        `).all(spoke.id) as any[];

        if (loops.length > 0) {
            console.log(chalk.bold('\n   🌀 LOGIC LOOPS'));
            loops.forEach(l => {
                const ratio = (l.think_count / Math.max(l.edit_count, 1)).toFixed(1);
                console.log(`   ◈ ${chalk.yellow(l.target_path.replace(spoke.root_path, ''))}`);
                console.log(`     THINK: ${chalk.red(l.think_count)} | EDIT: ${chalk.green(l.edit_count)} | Ratio: ${chalk.bold(ratio)}`);
            });
        }
    }

    console.log(chalk.cyan('\n ' + '━'.repeat(45) + '\n'));
}

runAnalytics().catch(console.error);
