import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addIdentity,
  addMessage,
  createEmptyState,
  exportDiaryData,
  getConversationView,
  importDiaryData,
  ensureThread,
} from '../src/domain.mjs';

test('mirrors the same conversation when switching account perspective', () => {
  let state = createEmptyState();
  ({ state } = addIdentity(state, {
    id: 'id-a',
    name: 'A',
    avatarColor: '#5fc66a',
    createdAt: '2026-04-29T08:00:00.000Z',
  }));
  ({ state } = addIdentity(state, {
    id: 'id-b',
    name: 'B',
    avatarColor: '#6aa7ff',
    createdAt: '2026-04-29T08:01:00.000Z',
  }));

  const created = ensureThread(state, 'id-a', 'id-b', {
    id: 'thread-ab',
    createdAt: '2026-04-29T08:02:00.000Z',
  });
  state = created.state;

  ({ state } = addMessage(state, {
    id: 'msg-1',
    threadId: 'thread-ab',
    senderId: 'id-a',
    body: '今天终于开始写这个日记。',
    createdAt: '2026-04-29T08:03:00.000Z',
  }));
  ({ state } = addMessage(state, {
    id: 'msg-2',
    threadId: 'thread-ab',
    senderId: 'id-b',
    body: '那就从这一句开始。',
    createdAt: '2026-04-29T08:04:00.000Z',
  }));

  const aView = getConversationView(state, 'thread-ab', 'id-a');
  assert.deepEqual(aView.messages.map((message) => message.side), ['outgoing', 'incoming']);
  assert.equal(aView.otherIdentity.name, 'B');

  const bView = getConversationView(state, 'thread-ab', 'id-b');
  assert.deepEqual(bView.messages.map((message) => message.side), ['incoming', 'outgoing']);
  assert.equal(bView.otherIdentity.name, 'A');
});

test('reuses one thread for the same two identities regardless of order', () => {
  let state = createEmptyState();
  ({ state } = addIdentity(state, { id: 'id-a', name: 'A' }));
  ({ state } = addIdentity(state, { id: 'id-b', name: 'B' }));

  const first = ensureThread(state, 'id-a', 'id-b', { id: 'thread-ab' });
  const second = ensureThread(first.state, 'id-b', 'id-a', { id: 'thread-ba' });

  assert.equal(first.thread.id, second.thread.id);
  assert.equal(second.state.threads.length, 1);
});

test('exports and imports the full diary state', () => {
  let state = createEmptyState();
  ({ state } = addIdentity(state, { id: 'id-a', name: 'A' }));
  ({ state } = addIdentity(state, { id: 'id-b', name: 'B' }));
  ({ state } = ensureThread(state, 'id-a', 'id-b', { id: 'thread-ab' }));
  ({ state } = addMessage(state, {
    id: 'msg-1',
    threadId: 'thread-ab',
    senderId: 'id-a',
    body: '备份测试',
    createdAt: '2026-04-29T09:00:00.000Z',
  }));

  const exported = exportDiaryData(state);
  const imported = importDiaryData(exported);

  assert.equal(imported.schemaVersion, 1);
  assert.deepEqual(imported.identities, state.identities);
  assert.deepEqual(imported.threads, state.threads);
  assert.deepEqual(imported.messages, state.messages);
});

test('rejects empty messages after trimming whitespace', () => {
  let state = createEmptyState();
  ({ state } = addIdentity(state, { id: 'id-a', name: 'A' }));
  ({ state } = addIdentity(state, { id: 'id-b', name: 'B' }));
  ({ state } = ensureThread(state, 'id-a', 'id-b', { id: 'thread-ab' }));

  assert.throws(() => {
    addMessage(state, {
      threadId: 'thread-ab',
      senderId: 'id-a',
      body: '   ',
    });
  }, /empty/i);
});
