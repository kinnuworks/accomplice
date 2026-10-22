import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, toDirectQuestion } from '../src/router.ts';

const suspects = [
  { id: 'cook', name: 'Mrs. Agatha Pike', role: 'the cook' },
  { id: 'niece', name: 'Clara Marlow', role: 'the niece' },
  { id: 'butler', name: 'Mr. Hollis', role: 'the butler' },
];
const tool = (u: string) => {
  const r = route(u, { suspects });
  return r.kind === 'tool' ? { tool: r.tool, ...r.args } : { kind: r.kind };
};

test('starting a case, with tone', () => {
  assert.deepEqual(tool('Alexa, start a new case'), { tool: 'start_case', tone: 'classic' });
  assert.deepEqual(tool("let's play a cozy mystery"), { tool: 'start_case', tone: 'cozy' });
  assert.deepEqual(tool('open Accomplice'), { tool: 'start_case', tone: 'classic' });
});

test('questioning a suspect in plain speech', () => {
  assert.deepEqual(tool('ask the cook where she was at nine'), { tool: 'question_suspect', suspect: 'the cook', question: 'Where were you at nine?' });
  assert.deepEqual(tool('Ask Clara if she heard anything'), { tool: 'question_suspect', suspect: 'Clara', question: 'Did you hear anything?' });
  assert.deepEqual(tool('ask the butler what he saw'), { tool: 'question_suspect', suspect: 'the butler', question: 'What did you see?' });
  assert.deepEqual(tool('Clara, did you hear the door?'), { tool: 'question_suspect', suspect: 'niece', question: 'Did you hear the door?' });
  assert.deepEqual(tool('did the butler see anything'), { tool: 'question_suspect', suspect: 'butler', question: 'Did the butler see anything?' });
  assert.equal(toDirectQuestion('about her rolling pin'), 'What do you know about your rolling pin?');
});

test('hints, clues, summary, suspects', () => {
  assert.deepEqual(tool('give me a hint'), { tool: 'get_hint' });
  assert.deepEqual(tool('next round please'), { tool: 'next_round' });
  assert.deepEqual(tool('show us more clues'), { tool: 'next_round' });
  assert.deepEqual(tool("we're stuck"), { tool: 'get_hint' });
  assert.deepEqual(tool('examine the boot prints'), { tool: 'examine_clue', clue: 'boot prints' });
  assert.deepEqual(tool('what clues do we have'), { tool: 'examine_clue' });
  assert.deepEqual(tool('what is the case'), { tool: 'case_summary' });
  assert.deepEqual(tool('who are the suspects?'), { tool: 'list_suspects' });
});

test('accusations', () => {
  assert.deepEqual(tool('I accuse the gardener'), { tool: 'accuse', culprit: 'the gardener' });
  assert.deepEqual(tool('it was Clara with the candlestick'), { tool: 'accuse', culprit: 'clara', item: 'the candlestick' });
});

test('confirmations and fallbacks', () => {
  assert.deepEqual(tool('yes, accuse'), { kind: 'yes' });
  assert.deepEqual(tool('not yet'), { kind: 'no' });
  assert.deepEqual(tool('stop'), { kind: 'stop' });
  assert.deepEqual(tool('what is the weather'), { kind: 'unknown' });
});
