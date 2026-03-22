import assert from 'node:assert';
import { test } from 'node:test';
import { validateBeadId } from '../../src/types/bead.ts';

test('validateBeadId: identifies valid bead identifiers', () => {
  assert.strictEqual(validateBeadId('bead:session-123:fragment-456'), true);
  assert.strictEqual(validateBeadId('bead:evolve:core'), true);
  assert.strictEqual(validateBeadId('bead:chant_session:init'), true);
  assert.strictEqual(validateBeadId('bead:1:2'), true);
});

test('validateBeadId: rejects malformed identifiers', () => {
  assert.strictEqual(validateBeadId('not-a-bead'), false);
  assert.strictEqual(validateBeadId('bead:session'), false);
  assert.strictEqual(validateBeadId('bead:session:'), false);
  assert.strictEqual(validateBeadId('bead::fragment'), false);
  assert.strictEqual(validateBeadId(':session:fragment'), false);
  assert.strictEqual(validateBeadId('bead:session:fragment:extra'), false);
  assert.strictEqual(validateBeadId(''), false);
});