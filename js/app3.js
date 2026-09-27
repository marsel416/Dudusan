// ---------- BIND UI ----------
function bindUI() {
  $('googleBtn').onclick = signInWithGoogle;

  $('btnProfile').onclick = () => { renderMyProfile(); openPanel('panel-profile'); };
  $('closeProfile').onclick = closeAllPanels;
  const openGifts = () => {
    try { renderGiftsShop(); } catch (e) { console.error(e); }
    try { renderGiftsMine(); } catch (e) { console.error(e); }
    openPanel('panel-gifts');
  };
  if ($('btnGifts')) $('btnGifts').onclick = openGifts;
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
  if ($('btnAttach')) {
    $('btnAttach').onclick = () => $('chatImageInput') && $('chatImageInput').click();
  }
  if ($('chatImageInput')) {
    $('chatImageInput').onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) sendImage(file);
      e.target.value = '';
    };
  }

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
function enterApp() {
  const authScreen = $('authScreen');
  const appEl = $('app');
  if (authScreen) {
    authScreen.hidden = true;
    authScreen.style.display = 'none';
  }
  if (appEl) {
    appEl.hidden = false;
    appEl.style.display = 'flex';
  }
}

function leaveApp() {
  const authScreen = $('authScreen');
  const appEl = $('app');
  if (appEl) {
    appEl.hidden = true;
    appEl.style.display = 'none';
  }
  if (authScreen) {
    authScreen.hidden = false;
    authScreen.style.display = '';
  }
}

function showAuthMessage(text) {
  const el = $('authError');
  if (el) {
    el.textContent = text;
    el.hidden = false;
  }
  toast(text);
}

let authReady = false;

async function finishLogin(user) {
  currentUser = user;
  try {
    await ensureProfile(user);
  } catch (e) {
    console.error('ensureProfile', e);
    // Минимальный профиль, если Firestore временно недоступен
    if (!profile) {
      profile = {
        id: user.uid,
        username: (user.email || 'user').split('@')[0],
        displayName: user.displayName || 'User',
        bio: '',
        photoURL: user.photoURL || '',
        balance: 0,
        premium: false,
        isOwner: false
      };
    }
    showAuthMessage('Профиль: ' + (e.code || e.message));
  }
  enterApp();
  try { renderMyProfile(); } catch (_) {}
  try { listenChats(); } catch (_) {}
  try { updateLastSeen(); } catch (_) {}
  try { renderGiftsShop(); renderGiftsMine(); } catch (_) {}
  toast('Вход выполнен');
}

// Сохраняем сессию между устройствами/вкладками
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

// Сначала обрабатываем возврат с Google (redirect)
(async function boot() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      showAuthMessage('Входим...');
      await finishLogin(result.user);
      authReady = true;
    }
  } catch (err) {
    console.error('redirect error', err);
    if (err && err.code && err.code !== 'auth/redirect-cancelled-by-user') {
      showAuthMessage('Google: ' + (err.code || err.message));
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      if (authReady && currentUser && currentUser.uid === user.uid) return;
      await finishLogin(user);
      authReady = true;
    } else {
      currentUser = null;
      profile = null;
      authReady = false;
      if (unsubChats) unsubChats();
      if (unsubMessages) unsubMessages();
      if (unsubPresence) unsubPresence();
      leaveApp();
      if ($('googleBtn')) $('googleBtn').disabled = false;
    }
  });
})();

bindUI();
