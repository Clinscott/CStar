import fs from 'node:fs';
import path from 'node:path';

/**
 * Watch the kernel source tree for changes and exit on edit so the host re-execs
 * us with a fresh module cache. Node's ESM cache never invalidates; without this,
 * `sterling_mandate.ts` and friends keep their boot-time bytecode for the entire
 * process lifetime, meaning disk-side fixes silently fail to enforce until the
 * MCP restarts. Opt out with CSTAR_KERNEL_DISABLE_WATCH=1.
 */
export async function attachSourceWatcher(
    projectRoot: string,
    onExit: (reason: string) => void,
): Promise<() => Promise<void>> {
    if (process.env.CSTAR_KERNEL_DISABLE_WATCH === '1') {
        return async () => { /* no-op */ };
    }
    let chokidarMod: typeof import('chokidar');
    try {
        chokidarMod = await import('chokidar');
    } catch (err) {
        console.error(`[cstar-kernel] chokidar unavailable; auto-restart-on-edit disabled: ${(err as Error).message}`);
        return async () => { /* no-op */ };
    }
    const chokidar = chokidarMod.default ?? chokidarMod;
    const watchRoot = path.join(projectRoot, 'src');
    if (!fs.existsSync(watchRoot)) {
        console.error(`[cstar-kernel] watch root ${watchRoot} not found; auto-restart disabled`);
        return async () => { /* no-op */ };
    }
    const watcher = chokidar.watch(watchRoot, {
        ignored: [/(^|[\\/])\../, '**/node_modules/**', '**/.stats/**'],
        persistent: true,
        ignoreInitial: true,
    });
    let pending: NodeJS.Timeout | null = null;
    const trigger = (filePath: string): void => {
        if (!/\.ts$/.test(filePath)) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
            const rel = path.relative(projectRoot, filePath);
            onExit(`source change in ${rel}`);
        }, 2000);
    };
    watcher.on('change', trigger);
    watcher.on('add', trigger);
    watcher.on('unlink', trigger);
    return async () => {
        if (pending) clearTimeout(pending);
        await watcher.close();
    };
}
