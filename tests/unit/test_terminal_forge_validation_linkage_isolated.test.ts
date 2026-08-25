/**
 * Run the real-database terminal linkage fixture in its own Node test process.
 * The kernel compatibility aggregator intentionally installs global database
 * mocks, so importing this fixture there would invalidate its transaction test.
 */
import './cstar-kernel-mcp/test_terminal_forge_validation_linkage.test.js';
