import {
  addIdentity,
  addMessage,
  createEmptyState,
  exportDiaryData,
  getActiveIdentity,
  getConversationView,
  getThreadsForIdentity,
  importDiaryData,
  openContactThread,
  switchActiveIdentity,
  updateIdentity,
} from './domain.mjs';
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from './idb.mjs';

const app = document.querySelector('#app');
const importFileInput = document.querySelector('#import-file');
const avatarFileInput = document.querySelector('#avatar-file');

let state = createEmptyState();
let route = 'threads';
let activeThreadId = null;
let draftSenderId = null;
let profileSheet = null;
let pendingAvatarIdentityId = null;

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
    name: '一般背离',
    avatarColor: '#5fc66a',
  }));
  ({ state: next, identity: other } = addIdentity(next, {
    name: '群助手',
    avatarColor: '#ffb21a',
  }));
  ({ state: next } = openContactThread(next, me.id, other.id));
  return next;
}

function render() {
  const activeIdentity = getActiveIdentity(state);
  if (!activeIdentity) {
    app.innerHTML = renderEmptyApp();
    return;
  }

  let screen;
  if (route === 'contacts') {
    screen = renderContacts(activeIdentity);
  } else if (route === 'chat' && activeThreadId) {
    try {
      screen = renderChat(activeIdentity);
      requestAnimationFrame(scrollMessagesToBottom);
    } catch (error) {
      console.warn(error);
      route = 'threads';
      activeThreadId = null;
      screen = renderThreads(activeIdentity);
    }
  } else {
    screen = renderThreads(activeIdentity);
  }

  app.innerHTML = `${screen}${renderProfileSheet()}`;
}

function renderThreads(activeIdentity) {
  const threads = getThreadsForIdentity(state, activeIdentity.id);
  const threadItems = threads.map((thread) => `
    <button class="thread-row" type="button" data-action="open-thread" data-thread-id="${thread.id}">
      ${renderAvatar(thread.otherIdentity, 'thread-avatar')}
      <span class="thread-main">
        <span class="thread-title">${escapeHtml(thread.otherIdentity.name)}</span>
        <span class="thread-preview">${escapeHtml(thread.lastMessage?.body || '')}</span>
      </span>
      <span class="thread-side">
        <span class="thread-time">${thread.lastMessage ? formatListTime(thread.lastMessage.createdAt) : ''}</span>
      </span>
    </button>
  `).join('');

  return `
    <section class="screen screen-list" aria-label="消息">
      ${renderHomeHeader(activeIdentity)}
      <div class="list-card">
        <div class="search-strip" aria-hidden="true">
          <span class="search-icon">⌕</span>
          <span>搜索</span>
        </div>
      <div class="thread-list">
          ${threadItems}
        </div>
      </div>
      ${renderBottomNav('threads')}
    </section>
  `;
}

function renderContacts(activeIdentity) {
  const contacts = state.identities.filter((identity) => identity.id !== activeIdentity.id);
  const contactRows = contacts.map((identity) => `
    <div class="contact-row">
      <button class="contact-open" type="button" data-action="open-contact" data-identity-id="${identity.id}">
        ${renderAvatar(identity, 'thread-avatar')}
        <span class="contact-copy">
          <strong>${escapeHtml(identity.name)}</strong>
          <span>点击进入对话</span>
        </span>
      </button>
      <button class="small-action" type="button" data-action="edit-contact" data-identity-id="${identity.id}" aria-label="编辑 ${escapeAttribute(identity.name)}">编辑</button>
    </div>
  `).join('');

  return `
    <section class="screen screen-contacts" aria-label="联系人">
      ${renderHomeHeader(activeIdentity, 'contacts')}
      <div class="list-card">
        <div class="section-title">
          <strong>联系人</strong>
          <span>${contacts.length} 位</span>
        </div>
        <div class="contact-list">
          ${contactRows || '<div class="empty-state">还没有联系人</div>'}
        </div>
      </div>
      ${renderBottomNav('contacts')}
    </section>
  `;
}

function renderHomeHeader(activeIdentity, mode = 'threads') {
  const plusLabel = mode === 'contacts' ? '新建联系人' : '新建联系人';
  return `
    <header class="home-header">
      <button class="profile-entry" type="button" data-action="open-account-panel" aria-label="打开账号面板">
        ${renderAvatar(activeIdentity, 'account-avatar')}
      </button>
      <div class="home-copy">
        <strong>${escapeHtml(activeIdentity.name)}</strong>
        <span><i aria-hidden="true"></i>在线 - WiFi ›</span>
      </div>
      <button class="plus-button" type="button" data-action="create-contact" aria-label="${plusLabel}">+</button>
    </header>
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
          <span>${escapeHtml(activeIdentity.name)}</span>
        </div>
        <span class="chatbar-spacer" aria-hidden="true"></span>
      </header>
      <div class="messages" id="message-list">
        ${messages}
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

function renderProfileSheet() {
  if (!profileSheet) {
    return '';
  }

  const identity = state.identities.find((item) => item.id === profileSheet.identityId);
  if (!identity) {
    profileSheet = null;
    return '';
  }

  const isAccountSheet = profileSheet.mode === 'account';
  return `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <section class="profile-sheet" role="dialog" aria-modal="true" aria-label="${isAccountSheet ? '账号面板' : '联系人资料'}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <form class="profile-form" data-action="save-profile" data-identity-id="${identity.id}">
        <button class="avatar-editor" type="button" data-action="change-avatar" data-identity-id="${identity.id}" aria-label="更换头像">
          ${renderAvatar(identity, 'sheet-avatar')}
          <span>更换头像</span>
        </button>
        <label class="name-field">
          <span>昵称</span>
          <input name="profileName" value="${escapeAttribute(identity.name)}" autocomplete="off" maxlength="32">
        </label>
        <div class="profile-actions">
          <button class="save-button" type="submit">保存资料</button>
          ${identity.avatarImageDataUrl ? `<button class="ghost-button" type="button" data-action="remove-avatar" data-identity-id="${identity.id}">移除头像</button>` : ''}
        </div>
      </form>
      ${isAccountSheet ? renderAccountTools(identity) : renderContactTools(identity)}
      <button class="sheet-close" type="button" data-action="close-sheet">完成</button>
    </section>
  `;
}

function renderAccountTools(activeIdentity) {
  return `
    <div class="sheet-section">
      <h2>切换账号</h2>
      <div class="account-switch-list">
        ${state.identities.map((identity) => `
          <button class="${identity.id === activeIdentity.id ? 'active' : ''}" type="button" data-action="switch-identity" data-identity-id="${identity.id}">
            ${renderAvatar(identity, 'mini-avatar')}
            <span>${escapeHtml(identity.name)}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="sheet-section">
      <h2>备份</h2>
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
  `;
}

function renderContactTools(identity) {
  return `
    <div class="sheet-section">
      <button class="action-row" type="button" data-action="open-contact" data-identity-id="${identity.id}">
        <span>打开聊天</span>
        <span>›</span>
      </button>
    </div>
  `;
}

function renderEmptyApp() {
  return `
    <section class="screen screen-contacts">
      <div class="empty-state">没有可用身份</div>
      <button class="send-button centered" type="button" data-action="reset-data">重建默认数据</button>
    </section>
  `;
}

function renderBottomNav(activeTab) {
  return `
    <nav class="bottom-nav" aria-label="底部导航">
      <button class="${activeTab === 'threads' ? 'active' : ''}" type="button" data-action="go-threads" aria-label="消息">
        <span class="nav-icon">●●</span>
        <span>消息</span>
      </button>
      <button class="${activeTab === 'contacts' ? 'active' : ''}" type="button" data-action="go-contacts" aria-label="联系人">
        <span class="nav-icon">♙</span>
        <span>联系人</span>
      </button>
    </nav>
  `;
}

function renderAvatar(identity, className) {
  const safeName = escapeHtml(identity.name.slice(0, 1).toUpperCase());
  const color = escapeAttribute(identity.avatarColor || '#5fc66a');
  if (identity.avatarImageDataUrl) {
    return `
      <span class="avatar ${className} has-image" style="--avatar-color: ${color}" aria-hidden="true">
        <img src="${escapeAttribute(identity.avatarImageDataUrl)}" alt="">
      </span>
    `;
  }
  return `
    <span class="avatar ${className}" style="--avatar-color: ${color}" aria-hidden="true">
      ${safeName}
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
    profileSheet = null;
    render();
  }

  if (action === 'open-contact') {
    await openContact(target.dataset.identityId);
  }

  if (action === 'back-to-threads') {
    route = 'threads';
    activeThreadId = null;
    render();
  }

  if (action === 'set-sender') {
    draftSenderId = target.dataset.senderId;
    render();
    focusDraft();
  }

  if (action === 'create-contact') {
    await createContact();
  }

  if (action === 'edit-contact') {
    profileSheet = { mode: 'contact', identityId: target.dataset.identityId };
    render();
  }

  if (action === 'open-account-panel') {
    profileSheet = { mode: 'account', identityId: state.activeIdentityId };
    render();
  }

  if (action === 'close-sheet') {
    profileSheet = null;
    render();
  }

  if (action === 'change-avatar') {
    pendingAvatarIdentityId = target.dataset.identityId;
    avatarFileInput.click();
  }

  if (action === 'remove-avatar') {
    state = updateIdentity(state, target.dataset.identityId, { avatarImageDataUrl: null });
    await persist();
    render();
  }

  if (action === 'switch-identity') {
    state = switchActiveIdentity(state, target.dataset.identityId);
    route = 'threads';
    activeThreadId = null;
    draftSenderId = state.activeIdentityId;
    profileSheet = null;
    await persist();
    render();
  }

  if (action === 'go-threads') {
    route = 'threads';
    activeThreadId = null;
    profileSheet = null;
    render();
  }

  if (action === 'go-contacts') {
    route = 'contacts';
    activeThreadId = null;
    profileSheet = null;
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

app.addEventListener('submit', async (event) => {
  if (event.target.matches('[data-action="send-message"]')) {
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
  }

  if (event.target.matches('[data-action="save-profile"]')) {
    event.preventDefault();
    const identityId = event.target.dataset.identityId;
    const formData = new FormData(event.target);
    state = updateIdentity(state, identityId, {
      name: formData.get('profileName'),
    });
    await persist();
    render();
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
    draftSenderId = state.activeIdentityId;
    profileSheet = null;
    await persist();
    render();
  } catch (error) {
    alert('备份文件无法导入。');
  }
});

avatarFileInput.addEventListener('change', async () => {
  const file = avatarFileInput.files?.[0];
  avatarFileInput.value = '';
  if (!file || !pendingAvatarIdentityId) {
    return;
  }

  try {
    const avatarImageDataUrl = await compressAvatar(file);
    state = updateIdentity(state, pendingAvatarIdentityId, { avatarImageDataUrl });
    await persist();
    render();
  } catch (error) {
    alert('头像无法读取，请换一张图片。');
  } finally {
    pendingAvatarIdentityId = null;
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
  const threadResult = openContactThread(state, activeIdentity.id, result.identity.id);
  state = threadResult.state;
  activeThreadId = threadResult.thread.id;
  draftSenderId = activeIdentity.id;
  route = 'chat';
  profileSheet = null;
  await persist();
  render();
}

async function openContact(identityId) {
  const activeIdentity = getActiveIdentity(state);
  const result = openContactThread(state, activeIdentity.id, identityId);
  state = result.state;
  activeThreadId = result.thread.id;
  draftSenderId = activeIdentity.id;
  route = 'chat';
  profileSheet = null;
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
  draftSenderId = state.activeIdentityId;
  profileSheet = null;
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

async function compressAvatar(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image failed to load.'));
    image.src = url;
  });
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

document.addEventListener('focusin', (event) => {
  if (route === 'chat' && event.target.matches('#draft')) {
    window.setTimeout(scrollMessagesToBottom, 120);
  }
});

window.addEventListener('resize', () => {
  if (route === 'chat') {
    window.setTimeout(scrollMessagesToBottom, 120);
  }
});

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

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
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
