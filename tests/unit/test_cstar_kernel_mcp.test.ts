/**
 * Compatibility test entrypoint for the CStar Kernel MCP suite.
 *
 * The old monolithic test body now lives in focused files under
 * `tests/unit/cstar-kernel-mcp/`. Keep this file small so existing checker
 * commands continue to work while the suite obeys the 500-line file contract.
 */
import './cstar-kernel-mcp/test_response_contracts.test.js';
import './cstar-kernel-mcp/test_tool_classes.test.js';
import './cstar-kernel-mcp/test_augury_bead_result.test.js';
import './cstar-kernel-mcp/test_token_path_result_feedback.test.js';
import './cstar-kernel-mcp/test_token_path_quarantine_boundary.test.js';
import './cstar-kernel-mcp/test_handoff_runtime_state.test.js';
import './cstar-kernel-mcp/test_dispatch_requests.test.js';
import './cstar-kernel-mcp/test_kernel_surfaces_core.test.js';
import './cstar-kernel-mcp/test_pennyone_mongo_context.test.js';
import './cstar-kernel-mcp/test_kernel_surfaces_spoke_telemetry.test.js';
import './cstar-kernel-mcp/test_spoke_anchor.test.js';
import './cstar-kernel-mcp/test_spoke_import.test.js';
import './cstar-kernel-mcp/test_spoke_attachment_mission_authority.test.js';
import './cstar-kernel-mcp/test_spoke_attachment_public_contract.test.js';
import './cstar-kernel-mcp/test_spoke_attachment_root_authority.test.js';
import './cstar-kernel-mcp/test_spoke_attachment_store_atomic.test.js';
import './cstar-kernel-mcp/test_spoke_attachment_verification_contract.test.js';
import './cstar-kernel-mcp/test_forge_execute.test.js';
import './cstar-kernel-mcp/test_forge_execute_traces.test.js';
import './cstar-kernel-mcp/test_forge_failure_evidence_fidelity.test.js';
import './cstar-kernel-mcp/test_forge_adapter_project_root.test.js';
import './cstar-kernel-mcp/test_file_size_contract.test.js';
