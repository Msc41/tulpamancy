import {
  addIdentity,
  addMessage,
  createEmptyState,
  ensureThread,
  exportDiaryData,
  getActiveIdentity,
  getConversationView,
  getThreadsForIdentity,
  importDiaryData,
  switchActiveIdentity,
} from './domain.mjs';
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from './idb.mjs';

const app = document.querySelector('#app');
const importFileInput = document.querySelector('#import-file');

let state = createEmptyState();
let route = 'threads';
let activeThreadId = null;
let draftSenderId = null;

boot();

async function boot() {
  try {
    const persisted = await loadPersistedState();
    state = persisted ? importDiaryData(persisted) : createSeedState();
  } catch (error) {
    console.warn(error);
    state = createSeedState();
  }

  await persist();
  render();
  registerServiceWorker();
}

function createSeedState() {
  let next = createEmptyState();
  let me;
  let other;
  ({ state: next, identity: me } = addIdentity(next, {
    name: '我',
    avatarColor: '#5fc66a',
  }));
  ({ state: next, identity: other } = addIdentity(next, {
    name: '她',
    avatarColor: '#6aa7ff',
  }));
  ({ state: next } = ensureThread(next, me.id, other.id));
  return next;
}

function render() {
  const activeIdentity = getActiveIdentity(state);
  if (!activeIdentity) {
    app.innerHTML = renderEmptyApp();
    return;
  }

  if (route === 'settings') {
    app.innerHTML = renderSettings(activeIdentity);
    return;
  }

  if (route === 'chat' && activeThreadId) {
    try {
      app.innerHTML = renderChat(activeIdentity);
      requestAnimationFrame(scrollMessagesToBottom);
      return;
    } catch (error) {
      console.warn(error);
      route = 'threads';
      activeThreadId = null;
    }
  }

  app.innerHTML = renderThreads(activeIdentity);
}

function renderThreads(activeIdentity) {
  const threads = getThreadsForIdentity(state, activeIdentity.id);
  const threadItems = threads.map((thread) => `
    <button class="thread-row" type="button" data-action="open-thread" data-thread-id="${thread.id}">
      ${renderAvatar(thread.otherIdentity, 'thread-avatar')}
      <span class="thread-main">
        <span class="thread-title">${escapeHtml(thread.otherIdentity.name)}</span>
        <span class="thread-preview">${escapeHtml(thread.lastMessage?.body || '还没有消息')}</span>
      </span>
      <span class="thread-time">${thread.lastMessage ? formatListTime(thread.lastMessage.createdAt) : ''}</span>
    </button>
  `).join('');

  return `
    <section class="screen screen-list" aria-label="会话列表">
      <header class="topbar">
        <div class="account-cluster">
          ${renderAvatar(activeIdentity, 'account-avatar')}
          <select class="account-select" data-action="switch-identity" aria-label="切换账号">
            ${state.identities.map((identity) => `
              <option value="${identity.id}" ${identity.id === activeIdentity.id ? 'selected' : ''}>
                ${escapeHtml(identity.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <button class="icon-button" type="button" data-action="create-contact" aria-label="新建联系人">+</button>
      </header>
      <div class="search-strip" aria-hidden="true">搜索</div>
      <div class="thread-list">
        ${threadItems || '<div class="empty-state">还没有会话</div>'}
      </div>
      ${renderBottomNav('threads')}
    </section>
  `;
}

function renderChat(activeIdentity) {
  const view = getConversationView(state, activeThreadId, activeIdentity.id);
  const validSenderIds = new Set([view.viewerIdentity.id, view.otherIdentity.id]);
  if (!validSenderIds.has(draftSenderId)) {
    draftSenderId = view.viewerIdentity.id;
  }

  let previousMessage = null;
  const messages = view.messages.map((message) => {
    const showTime = shouldShowTime(previousMessage, message);
    previousMessage = message;
    return `
      ${showTime ? `<div class="time-pill">${formatMessageTime(message.createdAt)}</div>` : ''}
      <article class="message-row ${message.side}">
        ${message.side === 'incoming' ? renderAvatar(message.sender, 'message-avatar') : ''}
        <div class="bubble">${linkifyText(message.body)}</div>
        ${message.side === 'outgoing' ? renderAvatar(message.sender, 'message-avatar') : ''}
      </article>
    `;
  }).join('');

  return `
    <section class="screen screen-chat" aria-label="聊天">
      <header class="chatbar">
        <button class="back-button" type="button" data-action="back-to-threads" aria-label="返回">‹</button>
        <div class="chat-title">
          <strong>${escapeHtml(view.otherIdentity.name)}</strong>
          <span>${escapeHtml(activeIdentity.name)} 的视角</span>
        </div>
        <button class="icon-button subtle" type="button" data-action="swap-account" aria-label="切换到对方账号">⇄</button>
      </header>
      <div class="messages" id="message-list">
        ${messages || '<div class="empty-state chat-empty">从第一句话开始</div>'}
      </div>
      <form class="composer" data-action="send-message">
        <div class="sender-toggle" role="group" aria-label="选择发送者">
          <button class="${draftSenderId === view.viewerIdentity.id ? 'active' : ''}" type="button" data-action="set-sender" data-sender-id="${view.viewerIdentity.id}">
            ${escapeHtml(view.viewerIdentity.name)}
          </button>
          <button class="${draftSenderId === view.otherIdentity.id ? 'active' : ''}" type="button" data-action="set-sender" data-sender-id="${view.otherIdentity.id}">
            ${escapeHtml(view.otherIdentity.name)}
          </button>
        </div>
        <div class="composer-row">
          <textarea id="draft" rows="1" placeholder="输入消息" autocomplete="off"></textarea>
          <button class="send-button" type="submit">发送</button>
        </div>
      </form>
    </section>
  `;
}

function renderSettings(activeIdentity) {
  return `
    <section class="screen screen-settings" aria-label="备份">
      <header class="topbar">
        <div class="page-title">
          <strong>备份</strong>
          <span>${escapeHtml(activeIdentity.name)} 的本机数据</span>
        </div>
      </header>
      <div class="settings-panel">
        <div class="stat-grid">
          <div><strong>${state.identities.length}</strong><span>身份</span></div>
          <div><strong>${state.threads.length}</strong><span>会话</span></div>
          <div><strong>${state.messages.length}</strong><span>消息</span></div>
        </div>
        <button class="action-row" type="button" data-action="export-data">
          <span>导出 JSON 备份</span>
          <span>›</span>
        </button>
        <button class="action-row" type="button" data-action="import-data">
          <span>导入并替换当前数据</span>
          <span>›</span>
        </button>
        <button class="action-row danger" type="button" data-action="reset-data">
          <span>清空本机数据</span>
          <span>›</span>
        </button>
      </div>
      <div class="identity-list">
        <h2>身份</h2>
        ${state.identities.map((identity) => `
          <div class="identity-row">
            ${renderAvatar(identity, 'thread-avatar')}
            <span>${escapeHtml(identity.name)}</span>
          </div>
        `).join('')}
      </div>
      ${renderBottomNav('settings')}
    </section>
  `;
}

function renderEmptyApp() {
  return `
    <section class="screen screen-settings">
      <div class="empty-state">没有可用身份</div>
      <button class="send-button centered" type="button" data-action="reset-data">重建默认数据</button>
    </section>
  `;
}

function renderBottomNav(activeTab) {
  return `
    <nav class="bottom-nav" aria-label="底部导航">
      <button class="${activeTab === 'threads' ? 'active' : ''}" type="button" data-action="go-threads">
        <span>☰</span>
        <span>聊天</span>
      </button>
      <button class="${activeTab === 'settings' ? 'active' : ''}" type="button" data-action="go-settings">
        <span>⇩</span>
        <span>备份</span>
      </button>
    </nav>
  `;
}

function renderAvatar(identity, className) {
  return `
    <span class="avatar ${className}" style="--avatar-color: ${identity.avatarColor}" aria-hidden="true">
      ${escapeHtml(identity.name.slice(0, 1).toUpperCase())}
    </span>
  `;
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.tagName === 'FORM') {
    return;
  }

  const action = target.dataset.action;
  if (action === 'open-thread') {
    activeThreadId = target.dataset.threadId;
    draftSenderId = state.activeIdentityId;
    route = 'chat';
    render();
  }

  if (action === 'back-to-threads') {
    route = 'threads';
    activeThreadId = null;
    render();
  }

  if (action === 'swap-account') {
    await swapToOtherAccount();
  }

  if (action === 'set-sender') {
    draftSenderId = target.dataset.senderId;
    render();
    focusDraft();
  }

  if (action === 'create-contact') {
    await createContact();
  }

  if (action === 'go-threads') {
    route = 'threads';
    activeThreadId = null;
    render();
  }

  if (action === 'go-settings') {
    route = 'settings';
    activeThreadId = null;
    render();
  }

  if (action === 'export-data') {
    downloadBackup();
  }

  if (action === 'import-data') {
    importFileInput.click();
  }

  if (action === 'reset-data') {
    await resetData();
  }
});

app.addEventListener('change', async (event) => {
  if (event.target.matches('[data-action="switch-identity"]')) {
    state = switchActiveIdentity(state, event.target.value);
    route = 'threads';
    activeThreadId = null;
    await persist();
    render();
  }
});

app.addEventListener('submit', async (event) => {
  if (!event.target.matches('[data-action="send-message"]')) {
    return;
  }

  event.preventDefault();
  const textarea = event.target.querySelector('#draft');
  const body = textarea.value;
  try {
    ({ state } = addMessage(state, {
      threadId: activeThreadId,
      senderId: draftSenderId || state.activeIdentityId,
      body,
    }));
    await persist();
    textarea.value = '';
    render();
  } catch (error) {
    textarea.focus();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('#draft')) {
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
  }
});

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  importFileInput.value = '';
  if (!file) {
    return;
  }

  if (!confirm('导入会替换当前本机数据。继续？')) {
    return;
  }

  try {
    const text = await file.text();
    state = importDiaryData(text);
    route = 'threads';
    activeThreadId = null;
    draftSenderId = null;
    await persist();
    render();
  } catch (error) {
    alert('备份文件无法导入。');
  }
});

async function createContact() {
  const name = prompt('联系人昵称');
  if (!name?.trim()) {
    return;
  }

  const activeIdentity = getActiveIdentity(state);
  const result = addIdentity(state, { name });
  state = result.state;
  const threadResult = ensureThread(state, activeIdentity.id, result.identity.id);
  state = threadResult.state;
  activeThreadId = threadResult.thread.id;
  draftSenderId = activeIdentity.id;
  route = 'chat';
  await persist();
  render();
}

async function swapToOtherAccount() {
  const view = getConversationView(state, activeThreadId, state.activeIdentityId);
  state = switchActiveIdentity(state, view.otherIdentity.id);
  draftSenderId = view.otherIdentity.id;
  route = 'chat';
  await persist();
  render();
}

async function resetData() {
  if (!confirm('清空后只能通过备份恢复。继续？')) {
    return;
  }

  await clearPersistedState();
  state = createSeedState();
  route = 'threads';
  activeThreadId = null;
  draftSenderId = null;
  await persist();
  render();
}

function downloadBackup() {
  const backup = exportDiaryData(state);
  const blob = new Blob([backup], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chat-diary-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function persist() {
  await savePersistedState(state);
}

function scrollMessagesToBottom() {
  const messageList = document.querySelector('#message-list');
  if (messageList) {
    messageList.scrollTop = messageList.scrollHeight;
  }
}

function focusDraft() {
  requestAnimationFrame(() => document.querySelector('#draft')?.focus());
}

function shouldShowTime(previousMessage, message) {
  if (!previousMessage) {
    return true;
  }
  const previous = new Date(previousMessage.createdAt).getTime();
  const current = new Date(message.createdAt).getTime();
  return current - previous > 5 * 60 * 1000;
}

function formatListTime(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function formatMessageTime(value) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function linkifyText(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed.', error);
    });
  }
}
