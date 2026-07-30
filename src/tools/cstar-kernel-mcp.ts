import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { neutralizeKernelMcpProcessEnv } from '../../bin/cstar-kernel-mcp-env.js';
import { registerCoreTools } from './cstar-kernel-mcp/register_core_tools.js';
import {
    CODE_ROOT,
    CONTROL_ROOT,
    formatBootstrapErrorRecord,
    logBootstrapError,
} from './cstar-kernel-mcp/contracts/runtime.js';
import { registry } from './pennyone/pathRegistry.js';
import { instrumentTool } from './cstar-kernel-mcp/telemetry/usage.js';
import { attachSourceWatcher } from './cstar-kernel-mcp/watch.js';

const DIRECT_KERNEL_MCP_LAUNCH = isDirectKernelMcpLaunch();
const KERNEL_MCP_LAUNCH_INTENT = process.env.CSTAR_KERNEL_MCP === '1';
if (KERNEL_MCP_LAUNCH_INTENT) {
    if (registry.getRoot() !== CONTROL_ROOT) {
        throw new Error('kernel_control_root_registry_mismatch');
    }
    neutralizeKernelMcpProcessEnv(process.env, {
        CSTAR_CODE_ROOT: CODE_ROOT,
        CSTAR_CONTROL_ROOT: CONTROL_ROOT,
        CSTAR_PROJECT_ROOT: CONTROL_ROOT,
        CSTAR_WORKSPACE_ROOT: CONTROL_ROOT,
    });
}

/**
 * CStar Kernel MCP entrypoint.
 *
 * Domain behavior lives in `src/tools/cstar-kernel-mcp/**`; this file owns only
 * bootstrapping, tool registration, and public test-facing re-exports.
 */
export const server = new McpServer({
    name: 'cstar-kernel',
    version: '3.1.0',
});

registerCoreTools(server, instrumentTool);

export {
    mcpGuardrail,
    mcpMutation,
    textResponse,
    errorResponse,
    normalizeErrorMessage,
    type McpTextResponse,
} from './cstar-kernel-mcp/contracts/responses.js';
export {
    handleHallMaintenance,
    handleHandoff,
    buildHandoffMcpPayload,
    handleHallSearch,
    handleDoctor,
    handleVerifyPlan,
} from './cstar-kernel-mcp/tools/hall.js';
export { handleAugury } from './cstar-kernel-mcp/tools/augury.js';
export {
    detectAuguryTargetDivergence,
    resolveAuguryCurrentIntentCategory,
    callerRequestedActiveSessionContinuity,
    decideAugurySessionRouting,
} from './cstar-kernel-mcp/tools/augury_routing.js';
export { handleBead, type BeadToolArgs } from './cstar-kernel-mcp/tools/bead.js';
export { handleGoalResume, type GoalResumeArgs } from './cstar-kernel-mcp/tools/goal_resume.js';
export {
    resolveSpokeAnchor,
    HALL_BEAD_STATUSES,
    HALL_BEAD_TARGET_KINDS,
} from './cstar-kernel-mcp/tools/shared.js';
export { handleSpokeBeadImport, type SpokeBeadImportArgs } from './cstar-kernel-mcp/tools/spoke_bead_import.js';
export { handleRecordResult } from './cstar-kernel-mcp/tools/result.js';
export { handleEngramRecord, handleWarGameScore } from './cstar-kernel-mcp/tools/war_game.js';
export { handleManifest, handleSkillInfo, handleSpokeJournal } from './cstar-kernel-mcp/tools/capability.js';
export { handleMongoMailbox, type MongoMailboxArgs } from './cstar-kernel-mcp/tools/mongo_mailbox.js';
export { handlePennyOneContext, type PennyOneContextArgs } from './cstar-kernel-mcp/tools/pennyone_context.js';
export { handleStatus, type StatusArgs } from './cstar-kernel-mcp/tools/status.js';
export { handlePersonaSet, type PersonaSetArgs } from './cstar-kernel-mcp/tools/persona_set.js';
export { handleEvolve } from './cstar-kernel-mcp/tools/evolve.js';
export { handleSpoke } from './cstar-kernel-mcp/tools/spoke.js';
export { handleIntentRoute } from './cstar-kernel-mcp/tools/intent_route.js';
export { handleWarden } from './cstar-kernel-mcp/tools/warden.js';
export { handleTelemetry } from './cstar-kernel-mcp/tools/telemetry.js';
export {
    handleDispatchRequest,
    handleResearcherRequest,
    type DispatchRequestArgs,
} from './cstar-kernel-mcp/tools/dispatch_request.js';
export { handleForgeRequest, type ForgeRequestArgs } from './cstar-kernel-mcp/tools/forge_request.js';
export { handleForgeAuthorize, type ForgeAuthorizeArgs } from './cstar-kernel-mcp/tools/forge_authorize.js';
export { handleForgeExecute, type ForgeExecutionArgs } from './cstar-kernel-mcp/tools/forge_execute.js';
export {
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
    summarizeRecentMcpUsage,
    summarizeRecentMcpUsefulness,
    instrumentTool,
    isPreAuthorizationRejection,
    type McpUsageEvent,
    type McpUsefulnessEvent,
    type McpUsefulnessSummary,
} from './cstar-kernel-mcp/telemetry/usage.js';
export {
    summarizeRecentTokenPathIntegration,
    appendTokenPathObservation,
    appendTokenPathAdvice,
    buildObservationFromAdvice,
    findRecentTokenPathAdvice,
    runTokenPathAdvisor,
    type TokenPathObservationPayload,
} from './cstar-kernel-mcp/telemetry/token_path.js';

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stdin.resume();
    const keepAlive = setInterval(() => {
        // Keep stdio MCP server alive while the host owns the pipe.
    }, 60_000);
    let detachWatcher: () => Promise<void> = async () => { /* no-op until attached */ };
    let exiting = false;
    const gracefulExit = (reason: string): void => {
        if (exiting) return;
        exiting = true;
        console.error(`[cstar-kernel] exiting: ${reason}`);
        clearInterval(keepAlive);
        void detachWatcher().finally(() => process.exit(0));
    };
    detachWatcher = await attachSourceWatcher(CODE_ROOT, (reason) => gracefulExit(reason));
    process.stdin.once('end', () => gracefulExit('stdin end'));
    process.stdin.once('close', () => gracefulExit('stdin close'));
    process.once('SIGTERM', () => gracefulExit('SIGTERM'));
}

function isDirectKernelMcpLaunch(): boolean {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return entry === fileURLToPath(import.meta.url);
}

if (KERNEL_MCP_LAUNCH_INTENT) {
    main().catch((error) => {
        logBootstrapError(error);
        console.error(`Fatal error in CStar Kernel MCP: ${formatBootstrapErrorRecord(error).trim()}`);
        process.exit(1);
    });
} else if (DIRECT_KERNEL_MCP_LAUNCH) {
    console.error('cstar_kernel_supported_launcher_required');
    process.exit(1);
}
