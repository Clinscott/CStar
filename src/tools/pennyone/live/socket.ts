import type { Server } from 'node:http';

import { PENNYONE_LIVE_RETIRED } from './recorder.js';

/** Retired before WebSocket listener registration or client allocation. */
export class SubspaceRelay {
    constructor(_server: Server) {
        throw new Error(PENNYONE_LIVE_RETIRED);
    }

    public async startPlayback(_pings: unknown[], _speed = 2): Promise<never> {
        throw new Error(PENNYONE_LIVE_RETIRED);
    }

    public broadcast(_type: string, _payload: unknown): never {
        throw new Error(PENNYONE_LIVE_RETIRED);
    }
}
