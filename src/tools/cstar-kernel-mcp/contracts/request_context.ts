/**
 * Request-scoped context supplied by the MCP SDK to every tool callback.
 *
 * Keep this structural rather than importing SDK internals so CStar only
 * depends on the fields it verifies. Callers cannot provide this object in a
 * tool's input schema; it comes from the active MCP request.
 */
export interface McpRequestContext {
    _meta?: Record<string, unknown>;
    requestId?: string | number;
    sessionId?: string;
}
