import assert from 'node:assert';
import { test } from 'node:test';
import { sayHello } from '../../src/hello.js';

test('sayHello returns hello', () => {
  assert.strictEqual(sayHello(), 'hello');
});