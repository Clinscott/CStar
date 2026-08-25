import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    handleHallMaintenance,
    RETIRED_HALL_MAINTENANCE_ERROR,
} from '../../../src/tools/cstar-kernel-mcp/tools/hall.js';

describe('retired Hall maintenance boundary', () => {
    it('fails without inspecting caller values or reading Hall', async () => {
        const poison = new Proxy({}, {
            get() { throw new Error('caller_input_inspected'); },
            ownKeys() { throw new Error('caller_input_enumerated'); },
        });

        const response = await handleHallMaintenance(poison);
        const body = JSON.parse(response.content[0]!.text);

        assert.equal(response.isError, true);
        assert.equal(body.error, RETIRED_HALL_MAINTENANCE_ERROR);
        assert.equal(body.decommissioned, true);
        assert.equal(body.actuated, false);
    });

    it('contains no hidden maintenance query or queue implementation', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/tools/hall.ts'),
            'utf8',
        );
        const maintenance = source.slice(
            source.indexOf('export async function handleHallMaintenance'),
            source.indexOf('export interface HandoffArgs'),
        );
        for (const forbidden of [
            'getReadDb',
            'listUnstudiedEngrams',
            'hall_episodic_memory',
            'ready_to_study',
            'harvest_queue_ready',
        ]) assert.equal(maintenance.includes(forbidden), false);
    });
});
