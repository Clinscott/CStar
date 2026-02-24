import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { EventEmitter } from 'events';

/**
 * [ODIN] Rigid Input Boundary Schema
 */
export interface IntentPayload {
    system_meta: Record<string, any>;
    intent_raw: string;
    intent_normalized: string;
    target_workflow: string;
    extracted_entities: Record<string, any>;
}

/**
 * [ALFRED] Continuous Output Boundary Schema
 */
export interface DaemonTelemetry {
    type?: 'TELEMETRY' | 'SYSTEM_RESTART' | 'HUD_STREAM';
    source?: string;
    message?: string;
    status?: string;
    data?: any;
    ts?: number;
}

export class CorvusProcess extends EventEmitter {
    private daemon: ChildProcessWithoutNullStreams | null = null;
    private isRunning: boolean = false;
    private restartCount: number = 0;
    private readonly MAX_RESTARTS = 5;
    private terminalPromptActive: boolean = false;

    constructor(private readonly entrypoint: string = 'src/core/cstar_dispatcher.py') {
        super();
    }

    public async boot(): Promise<void> {
        if (this.isRunning) return;

        this.restartCount = 0;
        this._spawn();
    }

    private _spawn(): void {
        // Spawn the hardened Python core
        // [Ω] Using 'python' or 'python3' based on environment
        this.daemon = spawn('python', [this.entrypoint]);
        this.isRunning = true;

        this.setupOutputBoundary();
        this.setupFaultTolerance();

        this.emit('telemetry', {
            type: 'TELEMETRY',
            source: 'SYSTEM',
            message: 'Corvus Daemon Spawning...',
            ts: Date.now()
        });
    }

    private setupFaultTolerance(): void {
        this.daemon?.on('close', (code) => {
            this.isRunning = false;
            this.emit('telemetry', {
                type: 'TELEMETRY',
                source: 'SYSTEM',
                status: 'EXIT',
                message: `Daemon exited with code ${code}`,
                ts: Date.now()
            });
            this.attemptResurrection();
        });

        this.daemon?.on('error', (err) => {
            this.emit('telemetry', {
                type: 'TELEMETRY',
                source: 'SYSTEM',
                status: 'ERROR',
                message: `Daemon crash: ${err.message}`,
                ts: Date.now()
            });
        });
    }

    private attemptResurrection(): void {
        if (this.restartCount >= this.MAX_RESTARTS) {
            this.emit('telemetry', {
                type: 'TELEMETRY',
                source: 'SYSTEM',
                status: 'FATAL',
                message: 'Max restarts exceeded. Hub offline.',
                ts: Date.now()
            });
            return;
        }

        const backoff = Math.pow(2, this.restartCount) * 1000;
        this.restartCount++;

        // [AMENDMENT D] Reconnection State Broadcasting
        this.emit('telemetry', {
            type: 'SYSTEM_RESTART',
            status: 'rebooting',
            data: { nextAttemptIn: backoff },
            ts: Date.now()
        });

        setTimeout(() => this._spawn(), backoff);
    }

    /**
     * [AMENDMENT A] NDJSON Stream Fragmentation Protection
     * Uses native readline to buffer incoming chunks and only emit on \n boundaries.
     */
    private setupOutputBoundary(): void {
        if (!this.daemon) return;

        const stdoutStream = readline.createInterface({
            input: this.daemon.stdout,
            terminal: false
        });

        stdoutStream.on('line', (line: string) => {
            this.routeOutput(line);
        });

        const stderrStream = readline.createInterface({
            input: this.daemon.stderr,
            terminal: false
        });

        stderrStream.on('line', (line: string) => {
            this.emit('telemetry', {
                type: 'TELEMETRY',
                source: 'STDERR',
                message: line,
                ts: Date.now()
            });
        });
    }

    private routeOutput(rawLine: string): void {
        const line = rawLine.trim();
        if (!line) return;

        try {
            // Attempt NDJSON parse
            const payload = JSON.parse(line);

            // [PHASE 3] Routing Target Type Guard
            // Only bridge to WebSocket if explicitly marked
            if (payload.__routing_target === 'ws' && payload.app_id) {
                const { __routing_target, app_id, ...data } = payload;
                import('./EventManager.js').then(({ EventManager }) => {
                    (EventManager.getInstance() as any).broadcast(app_id, data);
                });
                return;
            }

            // Fallback: Std SSE Telemetry
            this.emit('telemetry', { ...payload, type: 'TELEMETRY' });
        } catch {
            // Fallback: Raw HUD async rendering strings
            this.emit('telemetry', {
                type: 'HUD_STREAM',
                message: line,
                ts: Date.now()
            });
        }
    }

    /**
     * Injects rigid JSON payloads into standard input.
     */
    public dispatchIntent(payload: IntentPayload): void {
        if (!this.daemon || !this.isRunning) {
            throw new Error('Cannot dispatch: Daemon offline.');
        }

        const ndjson = JSON.stringify(payload) + '\n';

        // [AMENDMENT C] Respect standard I/O backpressure
        const success = this.daemon.stdin.write(ndjson);
        if (!success) {
            this.emit('telemetry', {
                type: 'TELEMETRY',
                source: 'SYSTEM',
                status: 'WARN',
                message: 'Backpressure detected on stdin.',
                ts: Date.now()
            });
        }
    }

    public async terminate(): Promise<void> {
        if (!this.daemon) return;

        // [Ω] Robustness: Check if kill exists (for mock environments)
        if (typeof this.daemon.kill !== 'function') {
            this.daemon = null;
            this.isRunning = false;
            return;
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.daemon?.kill('SIGKILL');
                this.daemon = null;
                this.isRunning = false;
                resolve();
            }, 5000);

            this.daemon?.once('close', () => {
                clearTimeout(timeout);
                this.daemon = null;
                this.isRunning = false;
                resolve();
            });

            this.daemon?.kill('SIGTERM');
        });
    }

    public getStatus(): boolean {
        return this.isRunning;
    }
}
