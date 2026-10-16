import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUiId } from '../src/lib/ui-id.ts';
test('uses a native UUID when available',()=>assert.equal(createUiId({randomUUID:()=> 'fixture-native-id'}),'fixture-native-id'));
test('HTTP fallback works without randomUUID and remains unique in the same millisecond',()=>{
 const ids=Array.from({length:100},()=>createUiId({}));
 assert.equal(new Set(ids).size,100);assert.ok(ids.every(id=>id.startsWith('ui-')));
});
