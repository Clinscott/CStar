import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verifyOperatorAuthorization } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    CSTAR_TARGET,
    TEST_BEAD_ID,
    TEST_DECISION_ID,
    TEST_PACKAGE_LOCK_SHA256,
    validScope,
} from './operator_authorization_test_support.js';

const SECOND_TARGET = CSTAR_TARGET.replace(/AGENTS\.md$/, 'package.json');
const SECRET_PATH_MENTION = CSTAR_TARGET.replace(/AGENTS\.md$/, '.agents/config.json');

afterEach(cleanupOperatorAuthorizationFixtures);

describe('exact Forge operator scope binding', () => {
    it('rejects bead, decision, and package-lock substitution on the same target', async () => {
        const fixture = createSession();
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                bead_id: 'bead:repair:substituted',
            }),
            /operator_authorization_bead_id_not_explicitly_granted/,
        );
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                decision_id: 'decision:substituted',
            }),
            /operator_authorization_decision_id_not_explicitly_granted/,
        );
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                package_lock_sha256s: [],
            }),
            /operator_authorization_package_lock_manifest_mismatch/,
        );
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                package_lock_sha256s: ['b'.repeat(64)],
            }),
            /operator_authorization_package_lock_manifest_mismatch/,
        );
    });

    it('requires exact zero-retry, synthetic-only, and no-live-source grant text', async () => {
        const cases = [
            {
                text: `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, synthetic fixtures only, no live source collection, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}, targeting exactly ${CSTAR_TARGET}.`,
                error: /operator_authorization_zero_retries_not_explicitly_granted/,
            },
            {
                text: `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, with zero retries, no live source collection, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}, targeting exactly ${CSTAR_TARGET}.`,
                error: /operator_authorization_synthetic_only_not_explicitly_granted/,
            },
            {
                text: `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, with zero retries, synthetic fixtures only, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}, targeting exactly ${CSTAR_TARGET}.`,
                error: /operator_authorization_no_live_source_not_explicitly_granted/,
            },
        ];
        for (const item of cases) {
            const fixture = createSession({ textParts: [item.text] });
            await assert.rejects(
                verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId)),
                item.error,
            );
        }
    });

    it('requires the complete positive target manifest and ignores prohibited path prose', async () => {
        const fixture = createSession({ textParts: [
            `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, with zero retries, synthetic fixtures only, no live source collection, targeting exactly ${CSTAR_TARGET} and ${SECOND_TARGET}. Do not read ${SECRET_PATH_MENTION}.`,
        ] });
        const base = {
            ...validScope(fixture.threadId),
            package_lock_sha256s: [],
        };
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, base),
            /operator_authorization_target_manifest_mismatch/,
        );
        const verified = await verifyOperatorAuthorization(fixture.reference, {
            ...base,
            target_paths: [CSTAR_TARGET, SECOND_TARGET],
        });
        assert.deepEqual(verified.authorized_paths.sort(), [CSTAR_TARGET, SECOND_TARGET].sort());
        assert.equal(verified.authorized_paths.includes(SECRET_PATH_MENTION), false);
    });

    it('rejects a lookalike root prefix instead of extracting a shorter authorized path', async () => {
        const lookalikeTarget = `${path.dirname(CSTAR_TARGET)}-lookalike${path.sep}AGENTS.md`;
        const fixture = createSession({ textParts: [
            `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, with zero retries, synthetic fixtures only, no live source collection, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}, targeting exactly ${lookalikeTarget}.`,
        ] });

        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId)),
            /operator_authorization_explicit_target_manifest_missing/,
        );
    });
});
