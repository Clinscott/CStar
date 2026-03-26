import { getDb } from '../src/tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../src/types/hall.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../');

function seedPhase5Beads() {
    const db = getDb(PROJECT_ROOT);
    const repoId = buildHallRepositoryId(normalizeHallPath(PROJECT_ROOT));
    const now = Date.now();

    const beads = [
        {
            id: 'bead:os:mimir-hook',
            rationale: 'Task 5.1: Automatic Context Injection. Modify weave:chant to automatically query mimir for the target files and inject historical Engrams/intent into the resulting Bead metadata.',
            target: 'src/node/core/runtime/weaves/chant_planner.ts'
        },
        {
            id: 'bead:os:kernel-traps',
            rationale: 'Task 5.2: Kernel-Level Traps (The Spells). Modify OrchestratorReaper to automatically catch validation failures and autonomously trigger weave:phoenix_loop.',
            target: 'src/node/core/runtime/reaper.ts'
        },
        {
            id: 'bead:os:muninn-daemon',
            rationale: 'Task 5.3: Background Daemonization (The Ravens). Bind the Muninn sweep to a Git post-commit hook or a background Node.js worker loop.',
            target: 'src/node/core/runtime/adapters/ravens_utils.ts'
        },
        {
            id: 'bead:os:scheduler-routing',
            rationale: 'Task 5.4: Deterministic Scheduler Routing (AutoBot). Update the chant planner to strictly enforce assigned_agent tags during mission shattering based on file types.',
            target: 'src/node/core/runtime/weaves/orchestrate.ts'
        },
        {
            id: 'bead:os:version-control',
            rationale: 'Task 5.5: Version Control Integration. Implement OS-level Git snapshotting and auto-reversion for failed worker beads within the Orchestrator, ensuring failed experiments do not pollute the working tree.',
            target: 'src/node/core/runtime/worker_bridge.ts'
        }
    ];

    console.log(`◤ SEEDING PHASE 5 BEADS INTO PENNYONE ◢`);
    
    for (const bead of beads) {
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, rationale, status, target_kind, target_path, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(bead_id) DO UPDATE SET
                rationale = excluded.rationale,
                target_path = excluded.target_path,
                status = excluded.status,
                updated_at = excluded.updated_at
        `).run(
            bead.id,
            repoId,
            bead.rationale,
            'SET',
            'FILE',
            bead.target,
            now,
            now
        );
        console.log(`  ◈ Seeded: ${bead.id} (Status: SET)`);
    }
    
    console.log(`◤ SEEDING COMPLETE ◢`);
}

seedPhase5Beads();
