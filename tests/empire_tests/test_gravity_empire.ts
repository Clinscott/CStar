import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { getFileGravity } from '../../src/tools/pennyone/intel/gravity_db.js';
import { GitChronograph } from '../../src/tools/pennyone/intel/git_monitor.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

// Identity: Lead Engineer (Gungnir Matrix)
// Mandate: Empire TDD / Linscott Standard / Node Native

describe('PennyOne Phase 2: 4D Gravity Calculus (Isolated)', () => {
    const testRepo = path.resolve(process.cwd(), 'tmp_gravity_test_isolated');
    const statsDir = path.join(testRepo, '.stats');

    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }

    after(() => {
        try {
            fs.rmSync(testRepo, { recursive: true, force: true });
        } catch (e) {
            // Silence EPERM in test env
        }
    });

    it('should calculate Gravity using the 4D Blueprint formula', async () => {
        const testFile = path.join(testRepo, 'formula_test.ts');
        fs.writeFileSync(testFile, 'export const x = 1;');

        // 1. Mock GitChronograph
        const originalGetFileChurn = GitChronograph.getFileChurn;
        GitChronograph.getFileChurn = async () => ({
            commits30d: 10,
            lines7d: 100,
            lastModified: Date.now()
        });

        // 2. Setup PennyOne Pings DB
        const pennyDbPath = path.join(statsDir, 'pennyone.db');
        const pennyDb = new Database(pennyDbPath);
        pennyDb.exec('CREATE TABLE IF NOT EXISTS pings (target_path TEXT, timestamp INTEGER);');
        const now = Date.now();
        for (let i = 0; i < 5; i++) {
            pennyDb.prepare('INSERT INTO pings (target_path, timestamp) VALUES (?, ?)').run(testFile, now - 1000);
        }
        pennyDb.close();

        // 3. Inject mock root
        const originalRoot = registry.getRoot();
        // @ts-ignore
        registry.root = testRepo;

        try {
            const gravity = await getFileGravity(testFile);
            assert.strictEqual(gravity, 35, 'Formula fail: (10*2) + (100*0.1) + (5*1) should be 35');
        } finally {
            GitChronograph.getFileChurn = originalGetFileChurn;
            // @ts-ignore
            registry.root = originalRoot;
        }
    });

    it('should respect manual weights in the total score', async () => {
        const testFile = path.join(testRepo, 'weight_test.ts');
        fs.writeFileSync(testFile, 'export const y = 2;');
        const normalizedPath = registry.normalize(testFile);

        const originalRoot = registry.getRoot();
        // @ts-ignore
        registry.root = testRepo;

        try {
            // Inject manual weight
            const gravDbPath = path.join(statsDir, 'gravity.db');
            const gravDb = new Database(gravDbPath);
            gravDb.exec(`
                CREATE TABLE IF NOT EXISTS file_gravity (
                    path TEXT PRIMARY KEY,
                    weight INTEGER DEFAULT 0,
                    commits_30d INTEGER DEFAULT 0,
                    lines_7d INTEGER DEFAULT 0,
                    pings_48h INTEGER DEFAULT 0,
                    last_sync INTEGER DEFAULT 0
                );
            `);
            gravDb.prepare('INSERT INTO file_gravity (path, weight, last_sync) VALUES (?, ?, ?)')
                .run(normalizedPath, 50, Date.now());
            gravDb.close();

            // Mock churn to 0
            const originalGetFileChurn = GitChronograph.getFileChurn;
            GitChronograph.getFileChurn = async () => ({ commits30d: 0, lines7d: 0, lastModified: Date.now() });

            const gravity = await getFileGravity(testFile);
            assert.strictEqual(gravity, 50, 'Manual weight should be 50');

            GitChronograph.getFileChurn = originalGetFileChurn;
        } finally {
            // @ts-ignore
            registry.root = originalRoot;
        }
    });
});
