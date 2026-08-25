export const RETIRED_PENNYONE_PROXY_ERROR =
    'legacy_pennyone_proxy_retired_use_cstar_kernel';

/**
 * Import-compatible tombstone for the former static/WebSocket proxy.
 * PennyOne is a bounded kernel-backed projection, not a server or dispatch
 * authority. Calling this function never binds a socket or writes a token.
 */
export async function startProxy(
    targetPath: string,
    port = 4000,
    options: {
        staticRoot?: string;
        statsRoot?: string;
        token?: string;
        watchStats?: boolean;
    } = {},
): Promise<never> {
    void targetPath;
    void port;
    void options;
    throw new Error(RETIRED_PENNYONE_PROXY_ERROR);
}
