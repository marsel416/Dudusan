/* ============================================
   DUDUSAN — Этап 2
   Auth + Profile + Avatars + Chats + Online
   ============================================ */

let currentUser = null;
let profile = null;
let isOwner = false;
let currentChatId = null;
let currentChatOther = null; // { uid, data }
let unsubChats = null;
let unsubMessages = null;
let unsubPresence = null;
let chatCache = {}; // chatId -> data
let userCache = {}; // uid -> data

// ---------- HELPERS ----------
function $(id) { return document.getElementById(id); }
function show(el) { if (typeof el === 'string') el = $(el); if (el) el.hidden = false; }
function hide(el) { if (typeof el === 'string') el = $(el); if (el) el.hidden = true; }

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function openPanel(id) {
  $('overlay').classList.add('open');
  $(id).classList.add('open');
}
function closeAllPanels() {
  $('overlay').classList.remove('open');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
}

function initial(name) {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 172800000) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const d = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
  return (Date.now() - d.getTime()) < 90000; // 90 секунд
}

function statusText(lastSeen) {
  if (isOnline(lastSeen)) return 'в сети';
  if (!lastSeen) return 'не в сети';
  const d = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return 'был(а) недавно';
  if (diff < 86400000) return 'был(а) сегодня';
  return 'был(а) ' + d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function avatarHTML(photoURL, name, sizeClass = '') {
  if (photoURL) {
    return `<img src="${escapeHtml(photoURL)}" alt="" loading="lazy">`;
  }
  return initial(name);
}

async function getUser(uid) {
  if (userCache[uid] && Date.now() - (userCache[uid]._ts || 0) < 60000) {
    return userCache[uid];
  }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = { id: uid, ...snap.data(), _ts: Date.now() };
  userCache[uid] = data;
  return data;
}

// ---------- AUTH ----------
async function signInWithGoogle() {
  const btn = $('googleBtn');
  btn.disabled = true;
  hide('authError');
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error(err);
    const el = $('authError');
    el.textContent = err.message || 'Ошибка входа';
    show(el);
    btn.disabled = false;
  }
}

async function ensureProfile(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();

  if (snap.exists) {
    profile = { id: user.uid, ...snap.data() };
  } else {
    const baseUsername = (user.email || 'user').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
    let username = baseUsername.toLowerCase();
    let exists = await db.collection('users').where('username', '==', username).limit(1).get();
    let n = 1;
    while (!exists.empty) {
      username = baseUsername.toLowerCase() + n;
      exists = await db.collection('users').where('username', '==', username).limit(1).get();
      n++;
    }

    const data = {
      username,
      displayName: user.displayName || username,
      bio: '',
      photoURL: user.photoURL || '',
      balance: 0,
      premium: false,
      premiumUntil: null,
      theme: 'pastel',
      glass: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      isOwner: false,
      giftsCount: 0
    };

    const usersCount = (await db.collection('users').limit(1).get()).size;
    if (usersCount === 0 || (typeof OWNER_UID === 'string' && OWNER_UID === user.uid)) {
      data.isOwner = true;
      data.balance = 10000;
      data.premium = true;
    }

    await ref.set(data);
    profile = { id: user.uid, ...data };
  }

  isOwner = !!profile.isOwner;
  applyTheme(profile.theme || 'pastel');
  if (profile.glass) {
    document.documentElement.classList.add('glass-on');
    $('glassToggle')?.classList.add('on');
  }
  return profile;
}

function updateLastSeen() {
  if (!currentUser) return;
  db.collection('users').doc(currentUser.uid).update({
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

// ---------- AVATAR UPLOAD ----------
async function uploadAvatar(file) {
  if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) {
    toast('Нужно изображение');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('Максимум 5 МБ');
    return;
  }

  toast('Загрузка...');
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `avatars/${currentUser.uid}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();

    await db.collection('users').doc(currentUser.uid).update({ photoURL: url });
    profile.photoURL = url;
    userCache[currentUser.uid] = { ...profile, _ts: Date.now() };
    renderMyProfile();
    toast('Аватар обновлён');
  } catch (e) {
    console.error(e);
    toast('Ошибка загрузки аватара');
  }
}

// ---------- UI: PROFILE ----------
function renderMyProfile() {
  if (!profile) return;
  const av = $('myAvatar');
  av.innerHTML = avatarHTML(profile.photoURL, profile.displayName);

  $('myName').textContent = profile.displayName || '—';
  $('myUsername').textContent = '@' + (profile.username || '—');
  $('myBio').textContent = profile.bio || 'Нет описания';
  $('myBalance').textContent = (profile.balance || 0).toLocaleString('ru');
  $('myGiftsCount').textContent = profile.giftsCount || 0;

  const plus = $('myPlus');
  if (profile.premium) {
    plus.textContent = 'Plus';
    plus.style.color = '#FFD60A';
  } else {
    plus.textContent = '—';
    plus.style.color = '';
  }

  if (isOwner) show('adminSection');
  else hide('adminSection');
}

// ---------- THEMES ----------
function applyTheme(theme) {
  if (theme === 'pastel') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === theme);
  });
}

async function saveTheme(theme) {
  applyTheme(theme);
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).update({ theme });
  profile.theme = theme;
  toast('Тема изменена');
}

async function toggleGlass() {
  const on = !document.documentElement.classList.contains('glass-on');
  document.documentElement.classList.toggle('glass-on', on);
  $('glassToggle').classList.toggle('on', on);
  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).update({ glass: on });
    profile.glass = on;
  }
  toast(on ? 'Стекло включено' : 'Стекло выключено');
}

// ---------- EDIT PROFILE ----------
function openEditProfile() {
  $('editUsername').value = profile.username || '';
  $('editName').value = profile.displayName || '';
  $('editBio').value = profile.bio || '';
  closeAllPanels();
  openPanel('panel-edit');
}

async function saveProfile() {
  const username = $('editUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const displayName = $('editName').value.trim().slice(0, 40);
  const bio = $('editBio').value.trim().slice(0, 200);

  if (!username || username.length < 3) {
    toast('Юзернейм минимум 3 символа');
    return;
  }
  if (!displayName) {
    toast('Укажите имя');
    return;
  }

  if (username !== profile.username) {
    const check = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!check.empty) {
      toast('Этот юзернейм уже занят');
      return;
    }
  }

  try {
    await db.collection('users').doc(currentUser.uid).update({
      username,
      displayName,
      bio
    });
    profile.username = username;
    profile.displayName = displayName;
    profile.bio = bio;
    userCache[currentUser.uid] = { ...profile, _ts: Date.now() };
    renderMyProfile();
    closeAllPanels();
    openPanel('panel-profile');
    toast('Профиль сохранён');
  } catch (e) {
    console.error(e);
    toast('Ошибка сохранения');
  }
}

// ---------- CHATS LIST ----------
function listenChats() {
  if (unsubChats) unsubChats();
  if (!currentUser) return;

  unsubChats = db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(async snap => {
      const list = $('chatsList');

      if (snap.empty) {
        list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:14px">Пока нет чатов.<br>Найди человека по юзернейму.</div>`;
        return;
      }

      // Собираем данные
      const items = [];
      for (const doc of snap.docs) {
        const c = { id: doc.id, ...doc.data() };
        chatCache[doc.id] = c;

        let title = c.title || 'Чат';
        let photo = '';
        let lastSeen = null;
        let otherUid = null;

        if (c.type === 'private') {
          otherUid = (c.members || []).find(id => id !== currentUser.uid);
          if (otherUid) {
            const u = await getUser(otherUid);
            if (u) {
              title = u.displayName || u.username || 'Пользователь';
              photo = u.photoURL || '';
              lastSeen = u.lastSeen;
            }
          }
        }

        items.push({
          id: doc.id,
          title,
          photo,
          lastMessage: c.lastMessage || '',
          updatedAt: c.updatedAt,
          lastSeen,
          otherUid,
          unread: 0
        });
      }

      list.innerHTML = items.map(item => `
        <div class="chat-item ${currentChatId === item.id ? 'active' : ''}" data-id="${item.id}">
          <div class="avatar">${avatarHTML(item.photo, item.title)}</div>
          <div class="chat-meta">
            <div class="chat-row">
              <div class="chat-name">${escapeHtml(item.title)}</div>
              <div class="chat-time">${formatTime(item.updatedAt)}</div>
            </div>
            <div class="chat-preview">
              <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.lastMessage)}</span>
            </div>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.chat-item').forEach(el => {
        el.onclick = () => openChat(el.dataset.id);
      });
    }, err => {
      console.error('chats error', err);
      if (err.code === 'failed-precondition') {
        $('chatsList').innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-secondary)">Нужен составной индекс Firestore. Открой консоль браузера (F12) — там будет ссылка «Create index».</div>`;
      }
    });
}

// ---------- SEARCH ----------
let searchTimer = null;
async function onSearchInput() {
  clearTimeout(searchTimer);
  const q = $('searchInput').value.trim().toLowerCase();
  if (q.length < 2) {
    listenChats();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const snap = await db.collection('users')
        .where('username', '>=', q)
        .where('username', '<=', q + '\uf8ff')
        .limit(20)
        .get();

      const list = $('chatsList');
      const docs = snap.docs.filter(d => d.id !== currentUser.uid);

      if (docs.length === 0) {
        list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:14px">Никого не найдено</div>`;
        return;
      }

      list.innerHTML = docs.map(d => {
        const u = d.data();
        userCache[d.id] = { id: d.id, ...u, _ts: Date.now() };
        return `
          <div class="chat-item" data-uid="${d.id}">
            <div class="avatar">${avatarHTML(u.photoURL, u.displayName)}</div>
            <div class="chat-meta">
              <div class="chat-row">
                <div class="chat-name">${escapeHtml(u.displayName || u.username)}</div>
              </div>
              <div class="chat-preview">@${escapeHtml(u.username)}</div>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.chat-item').forEach(el => {
        el.onclick = () => startChatWith(el.dataset.uid);
      });
    } catch (e) {
      console.error(e);
      toast('Ошибка поиска');
    }
  }, 280);
}

async function startChatWith(uid) {
  if (!uid || uid === currentUser.uid) return;

  // Ищем существующий private-чат
  const existing = await db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .where('type', '==', 'private')
    .get();

  let chatId = null;
  existing.forEach(doc => {
    const m = doc.data().members || [];
    if (m.includes(uid) && m.length === 2) chatId = doc.id;
  });

  if (!chatId) {
    const other = await getUser(uid);
    const ref = await db.collection('chats').add({
      type: 'private',
      members: [currentUser.uid, uid],
      membersInfo: {
        [currentUser.uid]: {
          displayName: profile.displayName,
          photoURL: profile.photoURL || '',
          username: profile.username
        },
        [uid]: {
          displayName: other?.displayName || '',
          photoURL: other?.photoURL || '',
          username: other?.username || ''
        }
      },
      title: other?.displayName || other?.username || 'Чат',
      lastMessage: '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    chatId = ref.id;
  }

  $('searchInput').value = '';
  listenChats();
  openChat(chatId);
}

// ---------- OPEN CHAT ----------
async function openChat(chatId) {
  currentChatId = chatId;
  hide('emptyState');
  show('chatView');

  if (window.innerWidth <= 768) {
    $('sidebar').classList.add('hide');
  }

  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) {
    toast('Чат не найден');
    return;
  }
  const chat = { id: chatDoc.id, ...chatDoc.data() };
  chatCache[chatId] = chat;

  let title = chat.title || 'Чат';
  let photo = '';
  let otherUid = null;
  let otherData = null;

  if (chat.type === 'private') {
    otherUid = (chat.members || []).find(id => id !== currentUser.uid);
    if (otherUid) {
      otherData = await getUser(otherUid);
      if (otherData) {
        title = otherData.displayName || otherData.username;
        photo = otherData.photoURL || '';
        currentChatOther = { uid: otherUid, data: otherData };
        $('chatStatus').textContent = statusText(otherData.lastSeen);
      }
    }
  } else {
    currentChatOther = null;
    $('chatStatus').textContent = 'канал';
  }

  $('chatName').textContent = title;
  const av = $('chatAvatar');
  av.innerHTML = avatarHTML(photo, title);

  // Подписка на lastSeen собеседника
  if (unsubPresence) unsubPresence();
  if (otherUid) {
    unsubPresence = db.collection('users').doc(otherUid).onSnapshot(snap => {
      if (!snap.exists) return;
      const u = snap.data();
      userCache[otherUid] = { id: otherUid, ...u, _ts: Date.now() };
      if (currentChatOther) currentChatOther.data = userCache[otherUid];
      $('chatStatus').textContent = statusText(u.lastSeen);
    });
  }

  // Сообщения
  if (unsubMessages) unsubMessages();
  unsubMessages = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(150)
    .onSnapshot(snap => {
      const box = $('messages');
      box.innerHTML = snap.docs.map(doc => {
        const m = doc.data();
        const mine = m.senderId === currentUser.uid;
        return `
          <div class="msg ${mine ? 'out' : 'in'}">
            ${escapeHtml(m.text || '')}
            <div class="msg-time">${formatTime(m.createdAt)}</div>
          </div>
        `;
      }).join('');
      box.scrollTop = box.scrollHeight;
    }, err => console.error('messages error', err));
}

async function sendMessage() {
  const input = $('msgInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  input.value = '';
  try {
    const batch = db.batch();
    const msgRef = db.collection('chats').doc(currentChatId).collection('messages').doc();
    batch.set(msgRef, {
      text,
      senderId: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(db.collection('chats').doc(currentChatId), {
      lastMessage: text.slice(0, 100),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
  } catch (e) {
    console.error(e);
    toast('Не удалось отправить');
  }
}

function closeChat() {
  currentChatId = null;
  currentChatOther = null;
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
  hide('chatView');
  show('emptyState');
  $('sidebar').classList.remove('hide');
  // обновить активный класс
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}

// ---------- VIEW OTHER PROFILE ----------
function openOtherProfile() {
  if (!currentChatOther) return;
  const u = currentChatOther.data;
  const av = $('uAvatar');
  av.innerHTML = avatarHTML(u.photoURL, u.displayName);
  $('uName').textContent = u.displayName || '—';
  $('uUsername').textContent = '@' + (u.username || '—');
  $('uBio').textContent = u.bio || 'Нет описания';
  $('uGifts').textContent = u.giftsCount || 0;
  const plus = $('uPlus');
  if (u.premium) {
    plus.textContent = 'Plus';
    plus.style.color = '#FFD60A';
  } else {
    plus.textContent = '—';
    plus.style.color = '';
  }
  openPanel('panel-user');
}

// ---------- ADMIN ----------
async function adminTransfer() {
  if (!isOwner) return toast('Нет прав');
  const username = $('trUser').value.trim().toLowerCase();
  const amount = parseInt($('trAmount').value, 10);
  if (!username || !amount || amount <= 0) return toast('Заполните поля');

  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) return toast('Пользователь не найден');

  await snap.docs[0].ref.update({
    balance: firebase.firestore.FieldValue.increment(amount)
  });
  toast(`Переведено ${amount} дуди → @${username}`);
  $('trUser').value = '';
  $('trAmount').value = '';
}

async function adminGivePlus() {
  if (!isOwner) return toast('Нет прав');
  const username = $('prUser').value.trim().toLowerCase();
  if (!username) return toast('Укажите юзернейм');

  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) return toast('Пользователь не найден');

  await snap.docs[0].ref.update({ premium: true, premiumUntil: null });
  toast(`DuduPlus выдан → @${username}`);
  $('prUser').value = '';
}

// ---------- BIND UI ----------
function bindUI() {
  $('googleBtn').onclick = signInWithGoogle;

  $('btnProfile').onclick = () => { renderMyProfile(); openPanel('panel-profile'); };
  $('closeProfile').onclick = closeAllPanels;
  $('btnGifts').onclick = () => openPanel('panel-gifts');
  $('closeGifts').onclick = closeAllPanels;
  $('closeUser').onclick = closeAllPanels;
  $('closeEdit').onclick = () => { closeAllPanels(); openPanel('panel-profile'); };
  $('overlay').onclick = closeAllPanels;

  $('btnEditProfile').onclick = openEditProfile;
  $('btnSaveProfile').onclick = saveProfile;
  $('btnThemes').onclick = () => {
    const row = $('themeRow');
    row.hidden = !row.hidden;
  };
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.onclick = () => saveTheme(s.dataset.theme);
  });
  $('glassToggle').onclick = toggleGlass;
  $('btnLogout').onclick = () => auth.signOut();

  $('btnTransfer').onclick = adminTransfer;
  $('btnGivePlus').onclick = adminGivePlus;

  $('searchInput').oninput = onSearchInput;
  $('btnBack').onclick = closeChat;
  $('btnSend').onclick = sendMessage;
  $('msgInput').onkeydown = e => { if (e.key === 'Enter') sendMessage(); };

  $('chatHeader').onclick = openOtherProfile;
  $('btnWriteUser').onclick = () => {
    closeAllPanels();
  };

  // Аватар: клик по своему аватару в профиле
  $('myAvatar').style.cursor = 'pointer';
  $('myAvatar').onclick = () => $('avatarInput').click();
  $('avatarInput').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar(file);
    e.target.value = '';
  };
}

// ---------- START ----------
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      await ensureProfile(user);
      hide('authScreen');
      show('app');
      renderMyProfile();
      listenChats();
      updateLastSeen();
      setInterval(updateLastSeen, 45000);
    } catch (e) {
      console.error(e);
      toast('Ошибка загрузки профиля');
      auth.signOut();
    }
  } else {
    currentUser = null;
    profile = null;
    if (unsubChats) unsubChats();
    if (unsubMessages) unsubMessages();
    if (unsubPresence) unsubPresence();
    hide('app');
    show('authScreen');
    $('googleBtn').disabled = false;
  }
});

bindUI();
