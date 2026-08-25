import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { taskCompleteMessageMatchesFinalAnswer } from '../../../src/tools/cstar-kernel-mcp/tools/host_workflow_message.js';

const BODY = 'Independent validation complete.\nManifest abc\nValidation val-test';
const CITATION = [
    '<oai-mem-citation>',
    '<citation_entries>',
    'MEMORY.md:1-2|note=[focused host-validation proof]',
    '</citation_entries>',
    '<rollout_ids>',
    '019f0000-0000-7000-8000-000000000202',
    '</rollout_ids>',
    '</oai-mem-citation>',
].join('\n');

describe('host-workflow task-complete message normalization', () => {
    it('accepts exact equality and exactly one trailing well-formed citation block', () => {
        assert.equal(taskCompleteMessageMatchesFinalAnswer(BODY, BODY), true);
        assert.equal(taskCompleteMessageMatchesFinalAnswer(`${BODY}${CITATION}`, BODY), true);
        assert.equal(taskCompleteMessageMatchesFinalAnswer(`${BODY}\n${CITATION}`, BODY), true);
    });

    it('rejects every non-equivalent mismatch class', () => {
        const cases: Array<[string, string, string]> = [
            ['arbitrary truncation', `${BODY}\n${CITATION}`, BODY.slice(0, -1)],
            ['prefix mismatch', `${BODY}\n${CITATION}`, `prefix ${BODY}`],
            ['suffix mismatch', `${BODY}\n${CITATION}`, `${BODY} suffix`],
            ['malformed citation', `${BODY}\n${CITATION.replace('</rollout_ids>', '<broken>')}`, BODY],
            ['multiple citation blocks', `${BODY}\n${CITATION}\n${CITATION}`, BODY],
            ['in-body citation', `${BODY}\n${CITATION}\ncontinued`, BODY],
            ['citation-only mismatch', CITATION, ''],
            ['ordinary mismatch', BODY, `${BODY} changed`],
        ];
        for (const [name, finalAnswer, taskCompleteMessage] of cases) {
            assert.equal(
                taskCompleteMessageMatchesFinalAnswer(finalAnswer, taskCompleteMessage),
                false,
                name,
            );
        }
    });

    it('rejects malformed citation content and an appended trailing newline', () => {
        assert.equal(
            taskCompleteMessageMatchesFinalAnswer(
                `${BODY}\n${CITATION.replace('MEMORY.md:1-2|note=[focused host-validation proof]', 'not-a-citation')}`,
                BODY,
            ),
            false,
        );
        assert.equal(taskCompleteMessageMatchesFinalAnswer(`${BODY}\n${CITATION}\n`, BODY), false);
    });
});
