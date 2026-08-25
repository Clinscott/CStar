import { RuntimeDispatcher } from './dispatcher.js';

/**
 * Initialize the retired Node runtime with an exact-empty adapter inventory.
 *
 * CStar lifecycle mutations belong to the typed cstar-kernel MCP surface.
 * Host-native cognition belongs to the active host conversation. The legacy
 * Node adapter spine therefore has no production execution authority.
 */
export function bootstrapRuntime(
    dispatcher: RuntimeDispatcher = RuntimeDispatcher.getInstance(),
): RuntimeDispatcher {
    dispatcher.clearAdapters();
    return dispatcher;
}
