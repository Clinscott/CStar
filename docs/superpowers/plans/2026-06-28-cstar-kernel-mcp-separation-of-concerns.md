# CStar Kernel MCP Separation Of Concerns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `cstar-kernel-mcp` so no production or test script exceeds 500 lines, each MCP tool family has a focused module with focused tests, and the public MCP tool inventory remains stable.

**Architecture:** Keep `src/tools/cstar-kernel-mcp.ts` as the stable entrypoint and move implementation into `src/tools/cstar-kernel-mcp/` modules. Preserve the existing `server.tool(...)` inventory and stdio behavior while extracting one tool family at a time behind a shared registration contract.

**Tech Stack:** TypeScript ESM, `@modelcontextprotocol/sdk`, `zod`, Node `--test` via `node scripts/run-tsx.mjs`, existing CStar Hall/Augury/PennyOne modules.

---

## Implementation Status

2026-06-28: Implemented the separation without introducing an `index.ts`/`server.ts` migration, to keep the public launcher path stable. The validated shape is:

- `src/tools/cstar-kernel-mcp.ts`: thin MCP entrypoint, compatibility exports, simple registrations, telemetry wrapper, stdio lifecycle.
- `src/tools/cstar-kernel-mcp/register_core_tools.ts`: grouped Hall/Augury/Bead registrations.
- `src/tools/cstar-kernel-mcp/tools/*`: handler families.
- `src/tools/cstar-kernel-mcp/contracts/*`: shared response, runtime, schema, and tool-class contracts.
- `src/tools/cstar-kernel-mcp/telemetry/*`: usage/usefulness and token-path accounting.
- `tests/unit/cstar-kernel-mcp/*`: split focused tests plus file-size contract.

The active invariant is `<=500` lines per production/focused MCP test file, enforced by `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts`.

## File Structure

Create these production modules, all under 500 lines:

- `src/tools/cstar-kernel-mcp/index.ts`: process/bootstrap entrypoint; creates the MCP server, registers tools, attaches source watcher, starts stdio transport.
- `src/tools/cstar-kernel-mcp/server.ts`: `createCstarKernelMcpServer()` and `registerCstarKernelTools(server, deps)`.
- `src/tools/cstar-kernel-mcp/contracts/tool_classes.ts`: `READ`, `MUTATION`, `REQUEST`, `EXECUTION`, `LEGACY` descriptions and inventory class map.
- `src/tools/cstar-kernel-mcp/contracts/responses.ts`: `textResponse`, `errorResponse`, `mcpGuardrail`, `mcpMutation`, response types.
- `src/tools/cstar-kernel-mcp/contracts/schemas.ts`: shared Zod schemas for dispatch, callbacks, package locks, retry, and tool-common shapes.
- `src/tools/cstar-kernel-mcp/contracts/runtime.ts`: project root, bootstrap logging, path containment, subprocess limits, small utility constants.
- `src/tools/cstar-kernel-mcp/telemetry/usage.ts`: MCP usage/usefulness append and summary logic.
- `src/tools/cstar-kernel-mcp/telemetry/token_path.ts`: token-path advice and observation logic.
- `src/tools/cstar-kernel-mcp/tools/hall.ts`: `cstar_handoff`, `cstar_hall_search`, `cstar_hall_maintenance`, `cstar_doctor`, `cstar_verify_plan`.
- `src/tools/cstar-kernel-mcp/tools/augury.ts`: `cstar_augury` wrapper and public handler.
- `src/tools/cstar-kernel-mcp/tools/intent_route.ts`: deterministic grammar-only route handler.
- `src/tools/cstar-kernel-mcp/tools/bead.ts`: `cstar_bead` and Sterling Mandate gate integration.
- `src/tools/cstar-kernel-mcp/tools/spoke.ts`: `cstar_spoke`, `cstar_spoke_bead_import`, `cstar_spoke_journal`.
- `src/tools/cstar-kernel-mcp/tools/capability.ts`: `cstar_manifest`, `cstar_skill_info`.
- `src/tools/cstar-kernel-mcp/tools/evolve.ts`: `cstar_evolve`.
- `src/tools/cstar-kernel-mcp/tools/warden.ts`: `cstar_warden`.
- `src/tools/cstar-kernel-mcp/tools/war_game.ts`: `cstar_engram_record`, `cstar_war_game_score`.
- `src/tools/cstar-kernel-mcp/tools/dispatch_request.ts`: `cstar_researcher_request`, `cstar_forge_request`.
- `src/tools/cstar-kernel-mcp/tools/forge_execute.ts`: `cstar_forge_execute` request binding, adapter selection, execution envelope.
- `src/tools/cstar-kernel-mcp/tools/forge_adapters.ts`: approved adapter registry, response-only adapter, edit-files worker adapter, adapter intent builders.
- `src/tools/cstar-kernel-mcp/tools/autobot.ts`: `cstar_autobot` legacy compatibility surface and disable logic.
- `src/tools/cstar-kernel-mcp/watch.ts`: source watcher.

Create focused tests, all under 500 lines:

- `tests/unit/cstar-kernel-mcp/test_tool_classes.test.ts`
- `tests/unit/cstar-kernel-mcp/test_response_contracts.test.ts`
- `tests/unit/cstar-kernel-mcp/test_hall_tools.test.ts`
- `tests/unit/cstar-kernel-mcp/test_augury_tools.test.ts`
- `tests/unit/cstar-kernel-mcp/test_bead_tools.test.ts`
- `tests/unit/cstar-kernel-mcp/test_spoke_tools.test.ts`
- `tests/unit/cstar-kernel-mcp/test_capability_evolve_warden.test.ts`
- `tests/unit/cstar-kernel-mcp/test_war_game_tools.test.ts`
- `tests/unit/cstar-kernel-mcp/test_dispatch_request.test.ts`
- `tests/unit/cstar-kernel-mcp/test_forge_execute.test.ts`
- `tests/unit/cstar-kernel-mcp/test_autobot_legacy.test.ts`
- `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts`

Keep these existing files as thin compatibility/smoke surfaces:

- `src/tools/cstar-kernel-mcp.ts`: entrypoint only, under 80 lines.
- `tests/unit/test_cstar_kernel_mcp.test.ts`: temporary compatibility import while tests migrate; delete or reduce below 80 lines by the final task.
- `tests/integration/cstar_kernel_mcp_stdio.test.ts`: keep under 500 lines; continues to prove live stdio inventory and schema independence.
- `tests/unit/test_mcp_config_invariants.test.ts`: keep under 500 lines; continues to prove docs/config/tool inventory consistency.

## Task 0: Finish Current MCP Lane Invariant Baseline

**Files:**
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/integration/cstar_kernel_mcp_stdio.test.ts`
- Modify: `tests/unit/test_mcp_config_invariants.test.ts`
- Modify: `docs/integrations/cstar-kernel-mcp.md`
- Modify: `docs/integrations/codex_mcp_contract.md`

- [ ] **Step 1: Run focused baseline validation**

Run:

```bash
node --check bin/cstar-kernel-mcp.js
node scripts/run-tsx.mjs --test tests/unit/test_cstar_kernel_mcp.test.ts tests/unit/test_mcp_config_invariants.test.ts
node scripts/run-tsx.mjs --test tests/integration/cstar_kernel_mcp_stdio.test.ts
git diff --check -- src/tools/cstar-kernel-mcp.ts tests/unit/test_cstar_kernel_mcp.test.ts tests/unit/test_mcp_config_invariants.test.ts tests/integration/cstar_kernel_mcp_stdio.test.ts docs/integrations/cstar-kernel-mcp.md docs/integrations/codex_mcp_contract.md
```

Expected: all commands pass.

- [ ] **Step 2: If the docs inventory test fails, fix the docs or test regex only**

Do not start extraction until the lane labels are green. The lane labels are the safety rail for the refactor.

## Task 1: Add Shared Contracts Without Moving Tool Logic

**Files:**
- Create: `src/tools/cstar-kernel-mcp/contracts/tool_classes.ts`
- Create: `src/tools/cstar-kernel-mcp/contracts/responses.ts`
- Create: `src/tools/cstar-kernel-mcp/contracts/runtime.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_tool_classes.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_response_contracts.test.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`

- [ ] **Step 1: Create the tool class contract test**

Create `tests/unit/cstar-kernel-mcp/test_tool_classes.test.ts` with:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MCP_TOOL_CLASS_PREFIXES,
    mcpToolDescription,
    CSTAR_KERNEL_TOOL_CLASSES,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';

describe('CStar MCP tool class contract', () => {
    it('publishes the only allowed plain-English tool classes', () => {
        assert.deepEqual(MCP_TOOL_CLASS_PREFIXES, ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY']);
    });

    it('prefixes tool descriptions consistently', () => {
        assert.equal(mcpToolDescription('REQUEST', 'Create a receipt.'), 'REQUEST: Create a receipt.');
    });

    it('classifies the full public tool inventory', () => {
        assert.equal(Object.keys(CSTAR_KERNEL_TOOL_CLASSES).length, 24);
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_forge_request, 'REQUEST');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_forge_execute, 'EXECUTION');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_autobot, 'LEGACY');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_bead, 'MUTATION');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_doctor, 'READ');
    });
});
```

- [ ] **Step 2: Create the tool class module**

Create `src/tools/cstar-kernel-mcp/contracts/tool_classes.ts` with:

```ts
export const MCP_TOOL_CLASS_PREFIXES = ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY'] as const;

export type McpToolClassPrefix = typeof MCP_TOOL_CLASS_PREFIXES[number];

export const CSTAR_KERNEL_TOOL_CLASSES = {
    cstar_augury: 'READ',
    cstar_autobot: 'LEGACY',
    cstar_bead: 'MUTATION',
    cstar_doctor: 'READ',
    cstar_engram_record: 'MUTATION',
    cstar_evolve: 'READ',
    cstar_forge_execute: 'EXECUTION',
    cstar_forge_request: 'REQUEST',
    cstar_hall_maintenance: 'READ',
    cstar_hall_search: 'READ',
    cstar_handoff: 'READ',
    cstar_intent_route: 'READ',
    cstar_manifest: 'READ',
    cstar_record_result: 'MUTATION',
    cstar_researcher_request: 'REQUEST',
    cstar_skill_info: 'READ',
    cstar_spoke: 'MUTATION',
    cstar_spoke_bead_import: 'MUTATION',
    cstar_spoke_journal: 'READ',
    cstar_status: 'READ',
    cstar_telemetry: 'READ',
    cstar_verify_plan: 'READ',
    cstar_war_game_score: 'MUTATION',
    cstar_warden: 'READ',
} as const satisfies Record<string, McpToolClassPrefix>;

export function mcpToolDescription(toolClass: McpToolClassPrefix, description: string): string {
    return `${toolClass}: ${description}`;
}
```

- [ ] **Step 3: Move response helpers into `contracts/responses.ts`**

Move these existing definitions without behavior changes:

```ts
export interface McpTextResponse {
    [key: string]: unknown;
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export type McpGuardrailVerdict = 'allow' | 'caution' | 'block';
export type McpGuardrailAction = 'continue' | 'recover' | 'repair' | 'verify' | 'refuse';

export interface McpGuardrailPayload {
    verdict: McpGuardrailVerdict;
    action: McpGuardrailAction;
    reason: string;
    failed_checks?: string[];
    warning_checks?: string[];
}
```

Also move `textResponse`, `mcpGuardrail`, `mcpMutation`, `normalizeErrorMessage`, and `errorResponse` exactly as they behave today.

- [ ] **Step 4: Move runtime constants into `contracts/runtime.ts`**

Move:

```ts
export const HUB_KERNEL_VERSION = '1.0.0';
export const MCP_ERROR_MESSAGE_MAX = 512;
export const MCP_PROPOSAL_MAX_BYTES = 512 * 1024;
export const MCP_SAFE_PROPOSAL_ID = /^[a-zA-Z0-9._-]+$/;

export function isPathInside(child: string, parent: string): boolean {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) return true;
    const rel = path.relative(resolvedParent, resolvedChild);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}
```

Use the existing imports and behavior.

- [ ] **Step 5: Update the monolith imports**

In `src/tools/cstar-kernel-mcp.ts`, import the moved helpers:

```ts
import { mcpToolDescription } from './cstar-kernel-mcp/contracts/tool_classes.js';
import { errorResponse, mcpGuardrail, mcpMutation, textResponse, type McpTextResponse } from './cstar-kernel-mcp/contracts/responses.js';
import { HUB_KERNEL_VERSION, MCP_PROPOSAL_MAX_BYTES, MCP_SAFE_PROPOSAL_ID, isPathInside } from './cstar-kernel-mcp/contracts/runtime.js';
```

Delete duplicate local definitions from the monolith.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_tool_classes.test.ts tests/unit/cstar-kernel-mcp/test_response_contracts.test.ts tests/unit/test_cstar_kernel_mcp.test.ts
```

Expected: PASS.

## Task 2: Extract Dispatch Request And Forge Execute Families

**Files:**
- Create: `src/tools/cstar-kernel-mcp/contracts/schemas.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/dispatch_request.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/forge_execute.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/forge_adapters.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_dispatch_request.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_forge_execute.test.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/unit/test_cstar_kernel_mcp.test.ts`

- [ ] **Step 1: Move dispatch schemas**

Move `dispatchMetricSchema`, `dispatchPackageLockSchema`, `dispatchSpendPolicySchema`, `dispatchCallbackSchema`, `dispatchRetrySchema`, `dispatchRequestSchema`, and `forgeExecuteSchema` into `contracts/schemas.ts`.

Export:

```ts
export const dispatchRequestSchema = { ... };
export const forgeExecuteSchema = { ...dispatchRequestSchema, ... };
export type DispatchRequestArgs = z.infer<z.ZodObject<typeof dispatchRequestSchema>>;
export type ForgeExecuteArgs = z.infer<z.ZodObject<typeof forgeExecuteSchema>>;
```

- [ ] **Step 2: Move request handlers**

Move `handleResearcherRequest`, `handleForgeRequest`, and their private helpers into `tools/dispatch_request.ts`.

Export:

```ts
export { handleResearcherRequest, handleForgeRequest };
```

- [ ] **Step 3: Move execute handler and adapters**

Move `handleForgeExecute` into `tools/forge_execute.ts`.

Move adapter registry, adapter resolution, adapter intent builders, and adapter invocation into `tools/forge_adapters.ts`.

Keep these exported names:

```ts
export { handleForgeExecute };
export { resolveForgeExecutionAdapter, invokeForgeHermesMinimaxAdapter };
```

- [ ] **Step 4: Move existing tests into focused files**

Move every test whose name begins with `cstar_researcher_request`, `cstar_forge_request`, or `dispatch requests` into `test_dispatch_request.test.ts`.

Move every test whose name begins with `cstar_forge_execute` into `test_forge_execute.test.ts`.

Do not change assertions except import paths.

- [ ] **Step 5: Run dispatch tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_dispatch_request.test.ts tests/unit/cstar-kernel-mcp/test_forge_execute.test.ts
```

Expected: PASS.

## Task 3: Extract Hall, Doctor, Verify, Status, Evolve, Warden

**Files:**
- Create: `src/tools/cstar-kernel-mcp/tools/hall.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/status.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/evolve.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/warden.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_hall_tools.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_status_evolve_warden.test.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/unit/test_cstar_kernel_mcp.test.ts`

- [ ] **Step 1: Move Hall and health handlers**

Move these handlers into `tools/hall.ts`:

```ts
export { handleHallMaintenance, handleHandoff, handleHallSearch, handleDoctor, handleVerifyPlan };
```

Preserve existing database and Augury imports. Keep handler signatures unchanged.

- [ ] **Step 2: Move status and evolve**

Move `handleStatus` into `tools/status.ts`.

Move `handleEvolve`, `EvolveAction`, and proposal helpers into `tools/evolve.ts`.

- [ ] **Step 3: Move warden handler**

Move `handleWarden`, warden constants, Python resolver, and scan gate into `tools/warden.ts`.

- [ ] **Step 4: Move tests**

Move the matching tests from `tests/unit/test_cstar_kernel_mcp.test.ts` into:

```text
tests/unit/cstar-kernel-mcp/test_hall_tools.test.ts
tests/unit/cstar-kernel-mcp/test_status_evolve_warden.test.ts
```

Do not broaden assertions.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_hall_tools.test.ts tests/unit/cstar-kernel-mcp/test_status_evolve_warden.test.ts
```

Expected: PASS.

## Task 4: Extract Augury And Intent Routing

**Files:**
- Create: `src/tools/cstar-kernel-mcp/tools/augury.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/intent_route.ts`
- Create: `src/tools/cstar-kernel-mcp/telemetry/token_path.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_augury_tools.test.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/unit/test_cstar_kernel_mcp.test.ts`

- [ ] **Step 1: Move token-path helpers first**

Move token-path helper functions and observation file handling into `telemetry/token_path.ts`.

Export only:

```ts
export { runTokenPathAdvisor, appendTokenPathAdvice, appendTokenPathObservation, summarizeRecentTokenPathIntegration, findRecentTokenPathAdvice, buildObservationFromAdvice };
```

- [ ] **Step 2: Move Augury handler**

Move `handleAugury` and its Augury-specific helper functions into `tools/augury.ts`.

Keep `handleAugury({ prompt, inferred_intent, target_paths, scope })` unchanged.

- [ ] **Step 3: Move intent route handler**

Move `handleIntentRoute` and `MCP_INTENT_PROMPT_MAX` into `tools/intent_route.ts`.

- [ ] **Step 4: Move Augury and route tests**

Move tests named `cstar_augury`, stale Augury, active-session divergence, and `cstar_intent_route` into `test_augury_tools.test.ts`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_augury_tools.test.ts
```

Expected: PASS.

## Task 5: Extract Bead, Spoke, Capability, War Game, AutoBot

**Files:**
- Create: `src/tools/cstar-kernel-mcp/tools/bead.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/spoke.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/capability.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/war_game.ts`
- Create: `src/tools/cstar-kernel-mcp/tools/autobot.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_bead_tools.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_spoke_tools.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_capability_evolve_warden.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_war_game_tools.test.ts`
- Create: `tests/unit/cstar-kernel-mcp/test_autobot_legacy.test.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/unit/test_cstar_kernel_mcp.test.ts`

- [ ] **Step 1: Move bead handler**

Move `handleBead`, `compactBead`, Sterling Mandate helpers, and bead-specific types into `tools/bead.ts`.

- [ ] **Step 2: Move spoke handlers**

Move `handleSpoke`, `handleSpokeBeadImport`, `handleSpokeJournal`, spoke args, spoke anchor helpers, and git metadata helpers into `tools/spoke.ts`.

- [ ] **Step 3: Move capability handlers**

Move `handleManifest` and `handleSkillInfo` into `tools/capability.ts`.

- [ ] **Step 4: Move war-game handlers**

Move `handleEngramRecord`, `handleWarGameScore`, and war-game args into `tools/war_game.ts`.

- [ ] **Step 5: Move AutoBot**

Move `isAutobotMcpEnabled`, `handleAutobot`, and `AutobotArgs` into `tools/autobot.ts`.

- [ ] **Step 6: Move tests**

Move each family into its matching test file. Keep the disabled-AutoBot integration coverage in `tests/integration/cstar_kernel_mcp_stdio.test.ts`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_bead_tools.test.ts tests/unit/cstar-kernel-mcp/test_spoke_tools.test.ts tests/unit/cstar-kernel-mcp/test_capability_evolve_warden.test.ts tests/unit/cstar-kernel-mcp/test_war_game_tools.test.ts tests/unit/cstar-kernel-mcp/test_autobot_legacy.test.ts
```

Expected: PASS.

## Task 6: Build The Server Registration Module

**Files:**
- Create: `src/tools/cstar-kernel-mcp/server.ts`
- Create: `src/tools/cstar-kernel-mcp/index.ts`
- Create: `src/tools/cstar-kernel-mcp/watch.ts`
- Modify: `src/tools/cstar-kernel-mcp.ts`
- Modify: `tests/integration/cstar_kernel_mcp_stdio.test.ts`

- [ ] **Step 1: Create `server.ts`**

Create `createCstarKernelMcpServer()` and `registerCstarKernelTools(server)`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createCstarKernelMcpServer(): McpServer {
    return new McpServer({ name: 'cstar-kernel', version: '3.1.0' });
}

export function registerCstarKernelTools(server: McpServer): McpServer {
    // Register every existing tool here, importing schemas and handlers from focused modules.
    return server;
}
```

Fill the registration body by moving existing `server.tool(...)` calls, preserving names, descriptions, schemas, and `instrumentTool(...)`.

- [ ] **Step 2: Create `index.ts`**

Move the stdio transport startup into:

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCstarKernelMcpServer, registerCstarKernelTools } from './server.js';
import { attachSourceWatcher } from './watch.js';

export async function main(): Promise<void> {
    const server = registerCstarKernelTools(createCstarKernelMcpServer());
    const teardown = await attachSourceWatcher((reason) => {
        process.stderr.write(`[cstar-kernel-mcp] source changed: ${reason}\n`);
        process.exit(0);
    });
    process.once('SIGTERM', async () => {
        await teardown();
        process.exit(0);
    });
    await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 3: Reduce the compatibility entrypoint**

Replace `src/tools/cstar-kernel-mcp.ts` with:

```ts
import { main } from './cstar-kernel-mcp/index.js';

await main();
```

- [ ] **Step 4: Run stdio integration**

Run:

```bash
node scripts/run-tsx.mjs --test tests/integration/cstar_kernel_mcp_stdio.test.ts
```

Expected: PASS, exact tool inventory unchanged.

## Task 7: Add And Enforce The 500-Line File Contract

**Files:**
- Create: `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts`
- Modify: `tests/unit/test_cstar_kernel_mcp.test.ts`

- [ ] **Step 1: Create line-count test**

Create `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const LINE_LIMIT = 500;

function walkFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkFiles(full);
        return full.endsWith('.ts') ? [full] : [];
    });
}

function lineCount(filePath: string): number {
    return fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).length;
}

describe('CStar MCP file size contract', () => {
    it('keeps CStar MCP production and focused test scripts under 500 lines', () => {
        const files = [
            path.join(PROJECT_ROOT, 'src/tools/cstar-kernel-mcp.ts'),
            path.join(PROJECT_ROOT, 'tests/integration/cstar_kernel_mcp_stdio.test.ts'),
            path.join(PROJECT_ROOT, 'tests/unit/test_mcp_config_invariants.test.ts'),
            ...walkFiles(path.join(PROJECT_ROOT, 'src/tools/cstar-kernel-mcp')),
            ...walkFiles(path.join(PROJECT_ROOT, 'tests/unit/cstar-kernel-mcp')),
        ];
        const oversized = files
            .map((file) => ({ file: path.relative(PROJECT_ROOT, file), lines: lineCount(file) }))
            .filter((entry) => entry.lines > LINE_LIMIT);

        assert.deepEqual(oversized, []);
    });
});
```

- [ ] **Step 2: Delete or reduce the old monolithic unit test**

By this task, `tests/unit/test_cstar_kernel_mcp.test.ts` must either be deleted or reduced to a compatibility import smaller than 80 lines. Do not leave it as a 1,958-line catchall.

- [ ] **Step 3: Run the file-size test**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts
```

Expected: PASS with no oversized files.

## Task 8: Update Documentation And Skill Guidance

**Files:**
- Modify: `docs/integrations/cstar-kernel-mcp.md`
- Modify: `docs/integrations/codex_mcp_contract.md`
- Modify: `docs/operations/corvus-forge-skill-spec.md`
- Modify: `docs/operations/corvus-forge-pipeline-playbook.md`
- Modify: `.agents/skill_registry.json` only if it already owns CStar MCP guidance for this surface

- [ ] **Step 1: Document the module boundaries**

Add a section to `docs/integrations/cstar-kernel-mcp.md`:

```markdown
## Source Layout Contract

`src/tools/cstar-kernel-mcp.ts` is a compatibility entrypoint only.
Focused implementation modules live under `src/tools/cstar-kernel-mcp/`.
No production or focused test script in this MCP surface may exceed 500 lines.
Tool families must stay separated by responsibility: contracts, telemetry,
Hall, Augury, bead, spoke, dispatch request, Forge execute, adapter registry,
warden, war-game, and legacy AutoBot.
```

- [ ] **Step 2: Document worker routing expectations**

In `docs/operations/corvus-forge-skill-spec.md`, state:

```markdown
Forge implementation work should target one module family per packet. The
request packet must name the tool family and focused test file. Do not ask a
worker to refactor the entire MCP server in one run.
```

- [ ] **Step 3: Run docs invariant tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/test_mcp_config_invariants.test.ts
```

Expected: PASS.

## Task 9: Final Verification And MCP Runtime Proof

**Files:**
- No new files.

- [ ] **Step 1: Run all focused CStar MCP tests**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/*.test.ts tests/unit/test_mcp_config_invariants.test.ts tests/integration/cstar_kernel_mcp_stdio.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full current MCP unit compatibility suite**

Run:

```bash
node scripts/run-tsx.mjs --test tests/unit/*.test.ts tests/unit/war_game/*.test.ts tests/unit/spoke_discovery/*.test.ts tests/integration/cstar_kernel_mcp_stdio.test.ts
```

Expected: PASS or only documented pre-existing unrelated failures.

- [ ] **Step 3: Run syntax and whitespace gates**

Run:

```bash
node --check bin/cstar-kernel-mcp.js
git diff --check -- src/tools/cstar-kernel-mcp.ts src/tools/cstar-kernel-mcp tests/unit/cstar-kernel-mcp tests/integration/cstar_kernel_mcp_stdio.test.ts tests/unit/test_mcp_config_invariants.test.ts docs/integrations/cstar-kernel-mcp.md docs/integrations/codex_mcp_contract.md docs/operations/corvus-forge-skill-spec.md docs/operations/corvus-forge-pipeline-playbook.md
```

Expected: PASS.

- [ ] **Step 4: Prove live stdio inventory remains stable**

Run:

```bash
node scripts/run-tsx.mjs --test tests/integration/cstar_kernel_mcp_stdio.test.ts
```

Expected: PASS, exact 24-tool inventory unchanged, every tool description begins with its lane label.

## Self-Review

- Spec coverage: This plan covers clean separation of concerns, sub-functions/modules with focused tests, stable MCP behavior, and a 500-line file limit.
- No placeholders: Each task names exact files, exact commands, and the expected result. Implementation steps say which existing behavior moves and where.
- Type consistency: Public handler names remain unchanged until registration moves into `server.ts`; tests keep the exact public tool inventory stable.
- Risk control: The refactor is a strangler refactor. It moves one family at a time and runs focused tests after each move instead of rewriting the whole MCP server in one pass.

## Execution Handoff

Plan complete. Recommended execution route is Corvus Forge with one task per Forge worker packet, starting at Task 0 and stopping after each task for PMT review. Do not dispatch a single worker for all tasks; that would recreate the same monolith problem in the implementation process.
# Historical Plan — Superseded Topology

> This dated implementation plan is preserved for provenance. Its PMT-review
> execution chain and any MM role are superseded: PMTs are project information
> repositories only, MM is legacy, and current Forge/CoS authority comes from
> `AGENTS.md` plus the canonical Forge runbooks.
