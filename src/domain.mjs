export const SCHEMA_VERSION = 1;

const AVATAR_COLORS = [
  '#5fc66a',
  '#6aa7ff',
  '#f2a65a',
  '#d77cf2',
  '#53b9b5',
  '#ef6f6c',
  '#8f8ce7',
  '#c6a15f',
];

export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeIdentityId: null,
    identities: [],
    threads: [],
    messages: [],
  };
}

export function addIdentity(state, input = {}) {
  const name = normalizeName(input.name);
  const id = input.id || createId('identity');
  assertUniqueId(state.identities, id, 'identity');

  const identity = {
    id,
    name,
    avatarColor: input.avatarColor || AVATAR_COLORS[state.identities.length % AVATAR_COLORS.length],
    createdAt: input.createdAt || nowIso(),
  };

  return {
    identity,
    state: {
      ...state,
      activeIdentityId: state.activeIdentityId || identity.id,
      identities: [...state.identities, identity],
    },
  };
}

export function switchActiveIdentity(state, identityId) {
  requireIdentity(state, identityId);
  return {
    ...state,
    activeIdentityId: identityId,
  };
}

export function ensureThread(state, firstIdentityId, secondIdentityId, input = {}) {
  requireIdentity(state, firstIdentityId);
  requireIdentity(state, secondIdentityId);
  if (firstIdentityId === secondIdentityId) {
    throw new Error('A thread needs two different identities.');
  }

  const participantIds = canonicalPair(firstIdentityId, secondIdentityId);
  const existing = state.threads.find((thread) => samePair(thread.participantIds, participantIds));
  if (existing) {
    return { state, thread: existing, created: false };
  }

  const id = input.id || createId('thread');
  assertUniqueId(state.threads, id, 'thread');
  const createdAt = input.createdAt || nowIso();
  const thread = {
    id,
    participantIds,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  };

  return {
    thread,
    created: true,
    state: {
      ...state,
      threads: [...state.threads, thread],
    },
  };
}

export function addMessage(state, input = {}) {
  const thread = requireThread(state, input.threadId);
  requireIdentity(state, input.senderId);
  if (!thread.participantIds.includes(input.senderId)) {
    throw new Error('Message sender must be in this thread.');
  }

  const body = String(input.body || '').trim();
  if (!body) {
    throw new Error('Message cannot be empty.');
  }

  const createdAt = input.createdAt || nowIso();
  const id = input.id || createId('message');
  assertUniqueId(state.messages, id, 'message');

  const message = {
    id,
    threadId: thread.id,
    senderId: input.senderId,
    body,
    createdAt,
  };

  return {
    message,
    state: {
      ...state,
      threads: state.threads.map((item) => (
        item.id === thread.id ? { ...item, updatedAt: createdAt } : item
      )),
      messages: [...state.messages, message],
    },
  };
}

export function getConversationView(state, threadId, viewerIdentityId) {
  const thread = requireThread(state, threadId);
  requireIdentity(state, viewerIdentityId);
  if (!thread.participantIds.includes(viewerIdentityId)) {
    throw new Error('Viewer must be in this thread.');
  }

  const otherIdentityId = thread.participantIds.find((id) => id !== viewerIdentityId);
  const otherIdentity = requireIdentity(state, otherIdentityId);

  const messages = state.messages
    .filter((message) => message.threadId === thread.id)
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => ({
      ...message,
      side: message.senderId === viewerIdentityId ? 'outgoing' : 'incoming',
      sender: requireIdentity(state, message.senderId),
    }));

  return {
    thread,
    viewerIdentity: requireIdentity(state, viewerIdentityId),
    otherIdentity,
    messages,
  };
}

export function getThreadsForIdentity(state, identityId) {
  requireIdentity(state, identityId);
  return state.threads
    .filter((thread) => thread.participantIds.includes(identityId))
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((thread) => {
      const otherIdentityId = thread.participantIds.find((id) => id !== identityId);
      return {
        ...thread,
        otherIdentity: requireIdentity(state, otherIdentityId),
        lastMessage: getLastMessage(state, thread.id),
      };
    });
}

export function exportDiaryData(state) {
  return JSON.stringify(normalizeState(state), null, 2);
}

export function importDiaryData(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return normalizeState(parsed);
}

export function getActiveIdentity(state) {
  if (!state.activeIdentityId) {
    return null;
  }
  return state.identities.find((identity) => identity.id === state.activeIdentityId) || null;
}

function normalizeState(input) {
  if (!input || input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported diary backup version.');
  }

  const identities = requireArray(input.identities, 'identities').map((identity) => ({
    id: requireString(identity.id, 'identity id'),
    name: normalizeName(identity.name),
    avatarColor: requireString(identity.avatarColor || '#5fc66a', 'avatar color'),
    createdAt: normalizeDate(identity.createdAt),
  }));

  const identityIds = new Set(identities.map((identity) => identity.id));
  if (identityIds.size !== identities.length) {
    throw new Error('Backup contains duplicate identities.');
  }

  const threads = requireArray(input.threads, 'threads').map((thread) => {
    const participantIds = requireArray(thread.participantIds, 'thread participants');
    if (participantIds.length !== 2) {
      throw new Error('A thread must have exactly two identities.');
    }
    participantIds.forEach((id) => {
      if (!identityIds.has(id)) {
        throw new Error('Thread references an unknown identity.');
      }
    });
    return {
      id: requireString(thread.id, 'thread id'),
      participantIds: canonicalPair(participantIds[0], participantIds[1]),
      createdAt: normalizeDate(thread.createdAt),
      updatedAt: normalizeDate(thread.updatedAt || thread.createdAt),
    };
  });

  const threadIds = new Set(threads.map((thread) => thread.id));
  if (threadIds.size !== threads.length) {
    throw new Error('Backup contains duplicate threads.');
  }

  const messages = requireArray(input.messages, 'messages').map((message) => {
    if (!threadIds.has(message.threadId)) {
      throw new Error('Message references an unknown thread.');
    }
    if (!identityIds.has(message.senderId)) {
      throw new Error('Message references an unknown sender.');
    }
    const thread = threads.find((item) => item.id === message.threadId);
    if (!thread.participantIds.includes(message.senderId)) {
      throw new Error('Message sender is not in its thread.');
    }
    return {
      id: requireString(message.id, 'message id'),
      threadId: requireString(message.threadId, 'message thread'),
      senderId: requireString(message.senderId, 'message sender'),
      body: normalizeMessageBody(message.body),
      createdAt: normalizeDate(message.createdAt),
    };
  });

  const messageIds = new Set(messages.map((message) => message.id));
  if (messageIds.size !== messages.length) {
    throw new Error('Backup contains duplicate messages.');
  }

  const activeIdentityId = identityIds.has(input.activeIdentityId)
    ? input.activeIdentityId
    : identities[0]?.id || null;

  return {
    schemaVersion: SCHEMA_VERSION,
    activeIdentityId,
    identities,
    threads,
    messages,
  };
}

function getLastMessage(state, threadId) {
  return state.messages
    .filter((message) => message.threadId === threadId)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function canonicalPair(firstIdentityId, secondIdentityId) {
  return [firstIdentityId, secondIdentityId].slice().sort();
}

function samePair(first, second) {
  return first.length === 2 && second.length === 2 && first[0] === second[0] && first[1] === second[1];
}

function requireIdentity(state, identityId) {
  const identity = state.identities.find((item) => item.id === identityId);
  if (!identity) {
    throw new Error(`Unknown identity: ${identityId}`);
  }
  return identity;
}

function requireThread(state, threadId) {
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${threadId}`);
  }
  return thread;
}

function assertUniqueId(items, id, type) {
  if (items.some((item) => item.id === id)) {
    throw new Error(`Duplicate ${type} id: ${id}`);
  }
}

function normalizeName(name) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    throw new Error('Identity name cannot be empty.');
  }
  return normalized;
}

function normalizeMessageBody(body) {
  const normalized = String(body || '').trim();
  if (!normalized) {
    throw new Error('Message cannot be empty.');
  }
  return normalized;
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date in diary data.');
  }
  return date.toISOString();
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}
