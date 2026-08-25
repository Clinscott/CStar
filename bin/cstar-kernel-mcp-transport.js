const LOOPBACK_HOST_ALIASES = new Map([
    ['127.0.0.1', '127.0.0.1'],
    ['::1', '::1'],
    ['[::1]', '::1'],
    ['localhost', '127.0.0.1'],
]);

export function normalizeKernelMcpLoopbackHost(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    const loopbackHost = LOOPBACK_HOST_ALIASES.get(normalized);
    if (loopbackHost) {
        return loopbackHost;
    }

    throw new Error(
        'CSTAR_KERNEL_MCP_TCP_HOST must be one of 127.0.0.1, ::1, or localhost; '
        + `received ${JSON.stringify(value)}`,
    );
}
