import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DistillLessonsWeave } from '../../../../src/node/core/runtime/weaves/distill_lessons.js';
import { HarvestLessonsWeave } from '../../../../src/node/core/runtime/weaves/harvest_lessons.js';
import { database } from '../../../../src/tools/pennyone/intel/database.js';

describe('LiteRT Stability & Efficiency Tests', () => {
    afterEach(() => {
        mock.reset();
    });

    it('truncates massive engram summaries in DistillLessonsWeave to protect LiteRT', async () => {
        // 1. Setup a massive engram (10,000 characters)
        const massiveText = 'X'.repeat(10000);
        const engramId = 'engram:test:massive';
        
        mock.method(database, 'getEpisodicMemory', () => ({
            memory_id: engramId,
            tactical_summary: massiveText,
            files_touched: ['file1.ts'],
            successes: ['success1'],
            timestamp: Date.now(),
        }));

        // 2. Mock the host invoker to capture the prompt
        let capturedPrompt = '';
        const mockInvoker = async (request: any) => {
            capturedPrompt = request.prompt;
            return JSON.stringify({
                tree_nodes: [{ level: 'TREE', title: 'Test', content: 'Test content', tags: [] }]
            });
        };

        // 3. Mock the python runner for mimir_harvester
        const mockRunner = async () => ({ stdout: '{"status": "ok"}' });

        const weave = new DistillLessonsWeave(mockInvoker as any, mockRunner as any);
        
        await weave.execute(
            { weave_id: 'weave:distill-lessons', payload: { memory_id: engramId } },
            { workspace_root: '/tmp', env: {}, timestamp: Date.now() } as any
        );

        // 4. Verify truncation occurred (maxChars defaults to 8000 for summary)
        assert.ok(capturedPrompt.length < 10000, 'Prompt should be shorter than original massive text');
        assert.match(capturedPrompt, /\[... TRUNCATED TO PREVENT LOCAL MODEL CONTEXT OVERFLOW ...\]/);
    });

    it('implements delays in HarvestLessonsWeave to prevent congestion', async () => {
        // 1. Mock finding 2 unstudied engrams
        const mockRunner = async () => ({ stdout: JSON.stringify(['id1', 'id2']) });
        
        // 2. Mock dispatch port and track timing
        const callTimes: number[] = [];
        const mockDispatchPort = {
            dispatch: async () => {
                callTimes.push(Date.now());
                return { status: 'SUCCESS' };
            }
        };

        const weave = new HarvestLessonsWeave(mockDispatchPort as any, mockRunner as any);
        
        const startTime = Date.now();
        await weave.execute(
            { weave_id: 'weave:harvest-lessons', payload: { project_root: '/tmp', limit: 2 } },
            { workspace_root: '/tmp', env: {}, timestamp: Date.now() } as any
        );

        // 3. Verify delay (should be at least 500ms between calls)
        assert.equal(callTimes.length, 2);
        const delay = callTimes[1] - callTimes[0];
        assert.ok(delay >= 450, `Delay between calls should be approx 500ms, measured: ${delay}ms`);
        
        const totalDuration = Date.now() - startTime;
        assert.ok(totalDuration >= 1000, `Total duration should account for 2 delays, measured: ${totalDuration}ms`);
    });
});
