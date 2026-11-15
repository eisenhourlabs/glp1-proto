// E4: only the fixed reflection choices survive; nothing she types does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choicesOnly, WORKED, IN_THE_WAY, ADJUST, FOCUS } from '../../web/engine/reflection.js';

test('choicesOnly keeps known choices and drops everything else', () => {
  const r = choicesOnly({ worked: ['short_workouts', 'my own words', 'short_workouts'], in_the_way: ['busy', 'my knee'],
    adjust: 'please call me', focus: FOCUS[2], days: '3', minutes: 50, note: 'private', text: 'free text' });
  assert.deepEqual(r, { worked: ['short_workouts'], in_the_way: ['busy'], adjust: null, focus: FOCUS[2], days: 3, minutes: null });
});

test('choicesOnly: typed focus, odd types and empty input', () => {
  assert.equal(choicesOnly({ focus: 'Lose 20 lb before the wedding' }).focus, null);
  assert.equal(choicesOnly({ focus: ` ${FOCUS[0]} ` }).focus, FOCUS[0]);
  assert.deepEqual(choicesOnly({ worked: 'short_workouts', adjust: ['same'] }).worked, []);
  assert.deepEqual(choicesOnly(), { worked: [], in_the_way: [], adjust: null, focus: null, days: null, minutes: null });
  assert.deepEqual(choicesOnly(null).worked, []);
});

test('every list has unique keys', () => {
  for (const list of [WORKED, IN_THE_WAY, ADJUST]) assert.equal(new Set(list.map(([k]) => k)).size, list.length);
  assert.equal(new Set(FOCUS).size, FOCUS.length);
});
