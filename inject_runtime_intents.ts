import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

const runtimeFiles = [
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/adapters.ts',
    intent: 'Implements the runtime adapter layer for bridging TypeScript weaves with legacy Python skills and dynamic commands.',
    interaction: 'Provides the execution logic for PennyOne, DynamicCommand, and other core adapters.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/bootstrap.ts',
    intent: 'Initializes the Corvus Star runtime by registering all core adapters and weaves into the singleton dispatcher.',
    interaction: 'Main entry point for starting the agentic runtime and ensuring all capabilities are loaded.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/contracts.ts',
    intent: 'Defines the fundamental interfaces and types for the agentic runtime, including weave payloads and results.',
    interaction: 'Authoritative source for the protocol-level communication between different runtime components.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/dispatcher.ts',
    intent: 'The central hub for routing weave invocations to their respective adapters and managing the execution lifecycle.',
    interaction: 'Handles the singleton instance of the runtime and provides the primary dispatch port for all commands.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/estate_targeting.ts',
    intent: 'Logic for identifying and resolving target paths across the Brain and Spokes of the Corvus Estate.',
    interaction: 'Used by the runtime to ensure that operations are directed at the correct repository sectors.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/invocation.ts',
    intent: 'Provides utility functions for building and normalizing weave invocations from user inputs.',
    interaction: 'Ensures that all requests to the runtime conform to the established contracts.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/process_manager.ts',
    intent: 'Manages the lifecycle of background worker processes, implementing the Yo-Yo reaping pattern.',
    interaction: 'Provides APIs for spinning up, tracking, and aggressively terminating isolated workers.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/reaper.ts',
    intent: 'The cleanup engine for the orchestrator, responsible for harvesting outcomes and reaping stale processes.',
    interaction: 'Ensures that the compute environment remains clean and that all worker states are finalized.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/scheduler.ts',
    intent: 'The prioritization engine for the orchestrator, selecting SET beads from the Hall based on sovereignty and urgency.',
    interaction: 'Maintains the implementation queue and provides candidate beads for the swarm dispatch.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/telemetry.ts',
    intent: 'Runtime-specific telemetry bridge for recording performance metrics and trace reports during weave execution.',
    interaction: 'Integrates with the global telemetry skill to provide deep observability into agentic activity.'
  },
  {
    path: '/home/morderith/Corvus/CStar/src/node/core/runtime/worker_bridge.ts',
    intent: 'The communication layer between the orchestrator and its isolated workers (e.g., AutoBot/Hermes).',
    interaction: 'Handles the serialization of beads and the capture of worker logs and outcomes.'
  }
];

const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO intents_fts (path, intent, interaction_protocol)
    VALUES (?, ?, ?)
`);

for (const file of runtimeFiles) {
    insertStmt.run(file.path, file.intent, file.interaction);
    console.log(`- Injected intent for: ${file.path}`);
}

db.close();
