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

// Базовые подарки (file: assets/gifts/...)
const GIFT_CATALOG = [
  {
    id: 'alien_pup',
    name: 'Инощенок',
    price: 350,
    preview: '👽',
    file: 'assets/gifts/alien-pup.mp4',
    limited: false,
    maxLevel: 5,
    upgradeCost: 100
  },
  { id: 'star', name: 'Звезда', price: 50, preview: '⭐', file: null, limited: false, level: 1 },
  { id: 'heart', name: 'Сердце', price: 100, preview: '❤️', file: null, limited: false, level: 1 }
];

function giftPreviewHTML(g) {
  if (g.file) {
    if (/\.(mp4|webm)$/i.test(g.file)) {
      return '<video src="' + escapeHtml(g.file) + '" autoplay loop muted playsinline></video>';
    }
    return '<img src="' + escapeHtml(g.file) + '" alt="">';
  }
  return escapeHtml(g.preview || '🎁');
}

function renderGiftsShop() {
  const shop = $('giftsShop');
  if (!shop) return;
  shop.innerHTML = GIFT_CATALOG.map(g => (
    '<div class="gift-card" data-id="' + g.id + '">' +
      '<div class="gift-preview">' + giftPreviewHTML(g) + '</div>' +
      '<div class="gift-name">' + escapeHtml(g.name) + '</div>' +
      '<div class="gift-price">' + g.price + ' дуди</div>' +
    '</div>'
  )).join('');
  shop.querySelectorAll('.gift-card').forEach(el => {
    el.onclick = () => buyGift(el.dataset.id);
  });
}

async function buyGift(giftId) {
  if (!currentUser || !profile) return toast('Войди в аккаунт');
  const gift = GIFT_CATALOG.find(g => g.id === giftId);
  if (!gift) return;
  if ((profile.balance || 0) < gift.price) return toast('Не хватает дуди');

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data() || {};
      const bal = data.balance || 0;
      if (bal < gift.price) throw new Error('Не хватает дуди');
      const inv = data.inventory || [];
      inv.push({
        giftId: gift.id,
        name: gift.name,
        level: 1,
        boughtAt: Date.now(),
        file: gift.file || null
      });
      tx.update(userRef, {
        balance: bal - gift.price,
        inventory: inv,
        giftsCount: (data.giftsCount || 0) + 1
      });
    });
    const fresh = await userRef.get();
    profile = { id: currentUser.uid, ...fresh.data() };
    renderMyProfile();
    renderGiftsMine();
    toast('Куплен: ' + gift.name);
  } catch (e) {
    console.error(e);
    toast(e.message || 'Не удалось купить');
  }
}

function renderGiftsMine() {
  const box = $('giftsMine');
  if (!box) return;
  const inv = (profile && profile.inventory) || [];
  if (!inv.length) {
    box.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;padding:8px">Пока пусто</p>';
    return;
  }
  box.innerHTML = inv.map(function (item, idx) {
    const cat = GIFT_CATALOG.find(g => g.id === item.giftId);
    const level = item.level || 1;
    const maxLevel = (cat && cat.maxLevel) || 5;
    const preview = giftPreviewHTML({
      file: item.file || (cat && cat.file) || null,
      preview: (cat && cat.preview) || '🎁'
    });
    const canUp = level < maxLevel;
    return (
      '<div class="gift-card" data-idx="' + idx + '">' +
        '<div class="gift-preview">' + preview + '</div>' +
        '<div class="gift-name">' + escapeHtml(item.name || item.giftId) + '</div>' +
        '<div class="gift-price">ур. ' + level + (canUp ? ' · улучшить' : ' · макс') + '</div>' +
      '</div>'
    );
  }).join('');
  box.querySelectorAll('.gift-card').forEach(el => {
    el.onclick = () => upgradeGift(parseInt(el.dataset.idx, 10));
  });
}

// Шанс успеха: ур.1→2 = 70%, 2→3 = 50%, 3→4 = 30%, 4→5 = 15%
function upgradeChance(level) {
  if (level <= 1) return 0.70;
  if (level === 2) return 0.50;
  if (level === 3) return 0.30;
  return 0.15;
}

function upgradeCostFor(cat, level) {
  const base = (cat && cat.upgradeCost) || 100;
  return base * level;
}

async function upgradeGift(idx) {
  if (!currentUser || !profile) return;
  const inv = profile.inventory || [];
  const item = inv[idx];
  if (!item) return;

  const cat = GIFT_CATALOG.find(g => g.id === item.giftId);
  const level = item.level || 1;
  const maxLevel = (cat && cat.maxLevel) || 5;
  if (level >= maxLevel) return toast('Уже максимальный уровень');

  const cost = upgradeCostFor(cat, level);
  const chance = upgradeChance(level);
  const pct = Math.round(chance * 100);

  if ((profile.balance || 0) < cost) {
    return toast('Нужно ' + cost + ' дуди (шанс ' + pct + '%)');
  }

  // Рулетка: списываем стоимость, потом roll
  toast('Крутим... шанс ' + pct + '%');
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const success = Math.random() < chance;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data() || {};
      const bal = data.balance || 0;
      if (bal < cost) throw new Error('Не хватает дуди');

      const inventory = data.inventory || [];
      if (!inventory[idx] || inventory[idx].giftId !== item.giftId) {
        throw new Error('Подарок не найден');
      }

      if (success) {
        inventory[idx] = Object.assign({}, inventory[idx], { level: level + 1 });
      }
      // при провале уровень не падает — только трата дуди

      tx.update(userRef, {
        balance: bal - cost,
        inventory: inventory
      });
    });

    const fresh = await userRef.get();
    profile = { id: currentUser.uid, ...fresh.data() };
    renderMyProfile();
    renderGiftsMine();

    if (success) {
      toast('Успех! «' + item.name + '» → ур. ' + (level + 1));
    } else {
      toast('Не повезло. Уровень тот же, −' + cost + ' дуди');
    }
  } catch (e) {
    console.error(e);
    toast(e.message || 'Ошибка улучшения');
  }
}

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
    provider.setCustomParameters({ prompt: 'select_account' });

    // Сначала пробуем popup (на многих телефонах уже работает)
    try {
      await auth.signInWithPopup(provider);
      return;
    } catch (popupErr) {
      console.warn('popup failed, try redirect', popupErr.code || popupErr.message);
      // Если popup заблокирован / не поддерживается — redirect
      if (
        popupErr.code === 'auth/popup-blocked' ||
        popupErr.code === 'auth/popup-closed-by-user' ||
        popupErr.code === 'auth/operation-not-supported-in-this-environment' ||
        /mobile|android|iphone|ipad/i.test(navigator.userAgent)
      ) {
        toast('Переход к Google...');
        await auth.signInWithRedirect(provider);
        return;
      }
      throw popupErr;
    }
  } catch (err) {
    console.error(err);
    const el = $('authError');
    if (el) {
      el.textContent = (err.code || '') + ' ' + (err.message || 'Ошибка входа');
      el.hidden = false;
    }
    toast('Ошибка входа: ' + (err.code || err.message));
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
    const path = 'avatars/' + currentUser.uid;
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
    const code = e.code || '';
    if (code.indexOf('storage') !== -1 || code.indexOf('unauthorized') !== -1) {
      toast('Storage не настроен. Включи Storage в Firebase');
    } else {
      toast('Ошибка аватара: ' + (e.code || e.message || 'unknown'));
    }
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
