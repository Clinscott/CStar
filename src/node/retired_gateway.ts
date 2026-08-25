export const RETIRED_GATEWAY_ERROR = 'legacy_gateway_retired_use_cstar_kernel';

/**
 * Terminal boundary for the retired HTTP, WebSocket, and Python-bridge gateway.
 */
export function failRetiredGateway(): never {
    throw new Error(RETIRED_GATEWAY_ERROR);
}
