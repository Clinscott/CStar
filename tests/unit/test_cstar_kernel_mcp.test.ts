/**
 * Compatibility test entrypoint for the CStar Kernel MCP suite.
 *
 * The old monolithic test body now lives in focused files under
 * `tests/unit/cstar-kernel-mcp/`. Keep this file small so existing checker
 * commands continue to work while the suite obeys the 500-line file contract.
 */
const focusedKernelTestAlreadyDiscovered = process.env.CSTAR_SKIP_COMPAT_KERNEL_IMPORTS === '1'
    || process.argv.some((argument) =>
        argument.replaceAll('\\', '/').includes('tests/unit/cstar-kernel-mcp/'));

// Keep the legacy single-file checker entrypoint, but do not register every
// focused file a second time when the broad test command already discovers the
// focused glob. Duplicate registration shares fixture mocks and makes results
// depend on worker order.
if (!focusedKernelTestAlreadyDiscovered) {
    for (const testFile of [
        './cstar-kernel-mcp/test_response_contracts.test.js',
        './cstar-kernel-mcp/test_tool_classes.test.js',
        './cstar-kernel-mcp/test_augury_bead_result.test.js',
        './cstar-kernel-mcp/test_token_path_result_feedback.test.js',
        './cstar-kernel-mcp/test_token_path_quarantine_boundary.test.js',
        './cstar-kernel-mcp/test_handoff_runtime_state.test.js',
        './cstar-kernel-mcp/test_dispatch_requests.test.js',
        './cstar-kernel-mcp/test_kernel_surfaces_core.test.js',
        './cstar-kernel-mcp/test_pennyone_mongo_context.test.js',
        './cstar-kernel-mcp/test_kernel_surfaces_spoke_telemetry.test.js',
        './cstar-kernel-mcp/test_spoke_anchor.test.js',
        './cstar-kernel-mcp/test_spoke_import.test.js',
        './cstar-kernel-mcp/test_forge_execute.test.js',
        './cstar-kernel-mcp/test_forge_execute_traces.test.js',
        './cstar-kernel-mcp/test_forge_failure_evidence_fidelity.test.js',
        './cstar-kernel-mcp/test_forge_adapter_project_root.test.js',
        './cstar-kernel-mcp/test_file_size_contract.test.js',
    ]) {
        await import(testFile);
    }
}
