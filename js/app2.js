// ---------- CHATS LIST ----------
function listenChats() {
  if (unsubChats) unsubChats();
  if (!currentUser) return;

  // Без orderBy — не нужен составной индекс. Сортируем на клиенте.
  unsubChats = db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .onSnapshot(async snap => {
      const list = $('chatsList');
      if (!list) return;

      if (snap.empty) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:14px">Пока нет чатов.<br>Найди человека по юзернейму.</div>';
        return;
      }

      const items = [];
      for (const doc of snap.docs) {
        const c = { id: doc.id, ...doc.data() };
        chatCache[doc.id] = c;

        let title = c.title || 'Чат';
        let photo = '';
        let otherUid = null;

        if (c.type === 'private') {
          otherUid = (c.members || []).find(id => id !== currentUser.uid);
          if (otherUid) {
            const u = await getUser(otherUid);
            if (u) {
              title = u.displayName || u.username || 'Пользователь';
              photo = u.photoURL || '';
            } else if (c.membersInfo && c.membersInfo[otherUid]) {
              title = c.membersInfo[otherUid].displayName || c.membersInfo[otherUid].username || title;
              photo = c.membersInfo[otherUid].photoURL || '';
            }
          }
        }

        items.push({
          id: doc.id,
          title,
          photo,
          lastMessage: c.lastMessage || '',
          updatedAt: c.updatedAt,
          otherUid
        });
      }

      // Новые сверху
      items.sort((a, b) => {
        const ta = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
        const tb = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
        return tb - ta;
      });

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
      const list = $('chatsList');
      if (list) {
        list.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--text-secondary)">Ошибка загрузки чатов: ' + (err.code || err.message) + '</div>';
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
        let body = '';
        if (m.imageURL) {
          body += '<img class="msg-img" src="' + escapeHtml(m.imageURL) + '" alt="" loading="lazy">';
        }
        if (m.giftId) {
          const gFile = m.giftFile || '';
          let media = '';
          if (gFile && /\.(mp4|webm)$/i.test(gFile)) {
            media = '<video class="msg-gift-video" src="' + escapeHtml(giftFileUrl(gFile)) + '" autoplay loop muted playsinline></video>';
          } else if (gFile) {
            media = '<img class="msg-gift-video" src="' + escapeHtml(giftFileUrl(gFile)) + '" alt="">';
          } else {
            media = '<div style="font-size:40px">🎁</div>';
          }
          body += '<div class="msg-gift" data-gift="' + escapeHtml(m.giftId) + '">' +
            media +
            '<div class="msg-gift-name">' + escapeHtml(m.giftName || m.giftId) +
            (m.giftLevel ? ' · ур.' + m.giftLevel : '') + '</div></div>';
        }
        if (m.text) {
          body += '<div class="msg-text">' + escapeHtml(m.text) + '</div>';
        }
        return (
          '<div class="msg ' + (mine ? 'out' : 'in') + '">' +
            body +
            '<div class="msg-time">' + formatTime(m.createdAt) + '</div>' +
          '</div>'
        );
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
      type: 'text',
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

async function sendImage(file) {
  if (!file || !currentUser || !currentChatId) return;
  if (!file.type.startsWith('image/')) {
    toast('Нужно изображение');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('Максимум 8 МБ');
    return;
  }

  toast('Отправка фото...');
  try {
    const path = 'chat_images/' + currentChatId + '/' + Date.now() + '_' + currentUser.uid;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();

    const batch = db.batch();
    const msgRef = db.collection('chats').doc(currentChatId).collection('messages').doc();
    batch.set(msgRef, {
      imageURL: url,
      type: 'image',
      senderId: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(db.collection('chats').doc(currentChatId), {
      lastMessage: '📷 Фото',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
  } catch (e) {
    console.error(e);
    toast('Не удалось отправить фото. Проверь Storage');
  }
}

async function sendGiftToChat(idx) {
  if (!currentUser || !profile || !currentChatId) {
    return toast('Открой чат, чтобы отправить подарок');
  }
  const inv = profile.inventory || [];
  const item = inv[idx];
  if (!item) return toast('Подарок не найден');

  const cat = GIFT_CATALOG.find(g => g.id === item.giftId);
  const giftFile = item.file || (cat && cat.file) || null;
  const giftName = item.name || (cat && cat.name) || item.giftId;
  const giftLevel = item.level || 1;

  // Кому: второй участник личного чата
  let toUid = null;
  const chat = chatCache[currentChatId];
  if (chat && chat.type === 'private' && chat.members) {
    toUid = chat.members.find(id => id !== currentUser.uid) || null;
  }

  try {
    await db.runTransaction(async (tx) => {
      // Все чтения сначала
      const myRef = db.collection('users').doc(currentUser.uid);
      const mySnap = await tx.get(myRef);
      let toRef = null;
      let toSnap = null;
      if (toUid) {
        toRef = db.collection('users').doc(toUid);
        toSnap = await tx.get(toRef);
      }

      const myData = mySnap.data() || {};
      const inventory = (myData.inventory || []).slice();
      if (!inventory[idx] || inventory[idx].giftId !== item.giftId) {
        throw new Error('Подарок уже отправлен');
      }
      inventory.splice(idx, 1);

      // Потом все записи
      tx.update(myRef, {
        inventory: inventory,
        giftsCount: Math.max(0, (myData.giftsCount || 1) - 1)
      });

      if (toUid && toRef && toSnap) {
        const toData = toSnap.data() || {};
        const received = (toData.receivedGifts || []).slice();
        received.push({
          giftId: item.giftId,
          name: giftName,
          level: giftLevel,
          file: giftFile,
          from: currentUser.uid,
          at: Date.now()
        });
        const toInv = (toData.inventory || []).slice();
        toInv.push({
          giftId: item.giftId,
          name: giftName,
          level: giftLevel,
          file: giftFile,
          boughtAt: Date.now(),
          from: currentUser.uid
        });
        tx.update(toRef, {
          receivedGifts: received,
          inventory: toInv,
          giftsCount: (toData.giftsCount || 0) + 1
        });
      }
    });

    const giftPoster = item.poster || (cat && cat.poster) || null;
    await db.collection('chats').doc(currentChatId).collection('messages').add({
      type: 'gift',
      giftId: item.giftId,
      giftName: giftName,
      giftLevel: giftLevel,
      giftFile: giftFile,
      giftPoster: giftPoster,
      senderId: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chats').doc(currentChatId).update({
      lastMessage: '🎁 ' + giftName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const fresh = await db.collection('users').doc(currentUser.uid).get();
    profile = { id: currentUser.uid, ...fresh.data() };
    renderMyProfile();
    renderGiftsMine();
    closeAllPanels();
    toast('Подарок отправлен: ' + giftName);
  } catch (e) {
    console.error(e);
    toast(e.message || 'Не удалось отправить подарок');
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

  try {
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snap.empty) return toast('Пользователь не найден');

    const doc = snap.docs[0];
    await doc.ref.update({
      balance: firebase.firestore.FieldValue.increment(amount)
    });

    // Если перевод себе — сразу обновляем экран
    if (doc.id === currentUser.uid) {
      const fresh = await doc.ref.get();
      profile.balance = fresh.data().balance || 0;
      renderMyProfile();
    }

    toast('Переведено ' + amount + ' дуди → @' + username);
    $('trUser').value = '';
    $('trAmount').value = '';
  } catch (e) {
    console.error(e);
    toast('Ошибка перевода: ' + (e.code || e.message));
  }
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
              
