export const FORWARDED_TERMINATION_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);

const SIGNAL_EXIT_CODES = Object.freeze({
    SIGINT: 130,
    SIGTERM: 143,
    SIGKILL: 137,
});

function childIsRunning(child) {
    return child.exitCode === null && child.signalCode === null;
}

export function childExitCode(code, signal) {
    if (typeof code === 'number') {
        return code;
    }
    return SIGNAL_EXIT_CODES[signal] ?? 1;
}

export function installChildSignalRelay(child, options = {}) {
    const graceMs = options.graceMs ?? 1500;
    const log = options.log ?? (() => {});
    let forwardedSignal = null;
    let forceTimer = null;
    let cleanedUp = false;

    if (!Number.isFinite(graceMs) || graceMs < 0) {
        throw new Error(`child signal relay graceMs must be a non-negative finite number; received ${graceMs}`);
    }

    const forward = (signal) => {
        if (forwardedSignal !== null || !childIsRunning(child)) {
            return;
        }
        forwardedSignal = signal;
        log(`forwarding ${signal} to MCP child pid=${child.pid ?? 'unknown'}`);
        child.kill(signal);

        forceTimer = setTimeout(() => {
            if (!childIsRunning(child)) {
                return;
            }
            log(`MCP child did not exit within ${graceMs}ms; forwarding SIGKILL`);
            child.kill('SIGKILL');
        }, graceMs);
        forceTimer.unref?.();
    };

    const signalHandlers = new Map(
        FORWARDED_TERMINATION_SIGNALS.map((signal) => {
            const handler = () => forward(signal);
            process.on(signal, handler);
            return [signal, handler];
        }),
    );

    const cleanup = () => {
        if (cleanedUp) {
            return;
        }
        cleanedUp = true;
        if (forceTimer !== null) {
            clearTimeout(forceTimer);
        }
        for (const [signal, handler] of signalHandlers) {
            process.removeListener(signal, handler);
        }
    };

    child.once('exit', cleanup);
    child.once('error', cleanup);

    return { cleanup, forward };
}
