import test from 'node:test';
import assert from 'node:assert';
import { parseBeadId } from '../../src/types/bead';

test('parseBeadId: parses single-segment session IDs', () => {
  const result = parseBeadId('bead:bookmark:123');
  assert.deepStrictEqual(result, { sessionId: 'bookmark', fragment: '123' });
});

test('parseBeadId: parses dual-segment chant-session IDs', () => {
  const result = parseBeadId('bead:chant-session:abc-123:task-456');
  assert.deepStrictEqual(result, { sessionId: 'chant-session:abc-123', fragment: 'task-456' });
});

test('parseBeadId: parses dual-segment evolve IDs', () => {
  const result = parseBeadId('bead:evolve:v1-id:step-99');
  assert.deepStrictEqual(result, { sessionId: 'evolve:v1-id', fragment: 'step-99' });
});

test('parseBeadId: handles fragments with extra colons', () => {
  const result = parseBeadId('bead:orch:sess:sub:part');
  assert.deepStrictEqual(result, { sessionId: 'orch', fragment: 'sess:sub:part' });
});

test('parseBeadId: returns null for non-bead prefix', () => {
  const result = parseBeadId('other:bookmark:123');
  assert.strictEqual(result, null);
});

test('parseBeadId: returns null for insufficient segments', () => {
  assert.strictEqual(parseBeadId('bead:bookmark'), null);
  assert.strictEqual(parseBeadId('bead:chant-session:uuid'), null);
});

test('parseBeadId: returns null for empty input', () => {
  assert.strictEqual(parseBeadId(''), null);
});