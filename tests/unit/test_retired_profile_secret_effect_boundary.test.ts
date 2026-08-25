import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    ensureCorvusStarSchema,
    getProfile,
    getProfileByEmail,
    listSecretServices,
    setPreference,
    upsertProfile,
} from '../../src/tools/pennyone/profile.ts';
import { deleteSecret, storeSecret, useSecret } from '../../src/tools/pennyone/secrets.ts';

const ROOT = process.cwd();
const PROFILE_ERROR = /legacy_profile_persistence_retired_requires_supported_profile_surface/;
const SECRET_ERROR = /legacy_secret_store_retired_requires_request_scoped_operator_gate/;

function untouchedDatabase(): never {
    return new Proxy({}, {
        get() {
            throw new Error('database_must_not_be_touched');
        },
    }) as never;
}

describe('Retired profile and secret effect surfaces', () => {
    it('rejects every profile persistence operation before touching a database', () => {
        const db = untouchedDatabase();
        assert.throws(() => ensureCorvusStarSchema(db), PROFILE_ERROR);
        assert.throws(() => getProfile(db, 'synthetic', 'user'), PROFILE_ERROR);
        assert.throws(() => getProfileByEmail(db, 'user@example.invalid'), PROFILE_ERROR);
        assert.throws(() => upsertProfile(db, {
            oauth_provider: 'synthetic',
            oauth_sub: 'user',
        }), PROFILE_ERROR);
        assert.throws(() => setPreference(db, 'synthetic', 'user', 'density', 'compact'), PROFILE_ERROR);
        assert.throws(() => listSecretServices(db, 'synthetic', 'user'), PROFILE_ERROR);
    });

    it('rejects every secret operation before database, keyring, or callback effects', async () => {
        const db = untouchedDatabase();
        let callbackCalled = false;
        await assert.rejects(storeSecret(db, {
            provider: 'synthetic',
            sub: 'user',
            service: 'synthetic-service',
            secret: 'synthetic-value',
        }), SECRET_ERROR);
        await assert.rejects(deleteSecret(db, 'synthetic', 'user', 'synthetic-service'), SECRET_ERROR);
        await assert.rejects(useSecret('synthetic', 'user', 'synthetic-service', () => {
            callbackCalled = true;
            return 'unexpected';
        }), SECRET_ERROR);
        assert.equal(callbackCalled, false);
    });

    it('contains no dynamic provider, keyring, SQL, or environment access', () => {
        const profileSource = fs.readFileSync(
            path.join(ROOT, 'src/tools/pennyone/profile.ts'),
            'utf8',
        );
        const secretSource = fs.readFileSync(
            path.join(ROOT, 'src/tools/pennyone/secrets.ts'),
            'utf8',
        );
        const combined = `${profileSource}\n${secretSource}`;
        assert.doesNotMatch(combined, /await\s+import|@napi-rs\/keyring|\.prepare\(|\.exec\(|process\.env/);
    });
});
