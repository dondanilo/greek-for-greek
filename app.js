// ============================================================
// FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDFXEEYCj6DBEW6wpgPCaTUmtwi-LW4JLA",
  authDomain: "greek-for-greek.firebaseapp.com",
  projectId: "greek-for-greek",
  storageBucket: "greek-for-greek.firebasestorage.app",
  messagingSenderId: "779214300636",
  appId: "1:779214300636:web:8ee18943eaa003ffc55b19"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let currentUser = null;

let _signingIn = false;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const GOOGLE_BTN_HTML = '<svg class="google-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="22" height="22"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.5-3.1-11.3-7.6l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.9 2.4-2.5 4.5-4.5 5.9l.1-.1 6.2 5.2C36.9 40.7 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg> Войти через Google';

function signInWithGoogle() {
  if (_signingIn) return;
  _signingIn = true;
  const btn = document.querySelector('.btn-google-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Подождите...'; }

  const provider = new firebase.auth.GoogleAuthProvider();
  const resetBtn = () => {
    _signingIn = false;
    if (btn) { btn.disabled = false; btn.innerHTML = GOOGLE_BTN_HTML; }
  };
  const useRedirect = () => {
    auth.signInWithRedirect(provider);
    // страница перезагрузится, кнопку не сбрасываем
  };

  // Таймаут 12 сек: если popup завис или заблокирован без ошибки — переходим на redirect
  const fallbackTimer = setTimeout(() => {
    if (_signingIn) useRedirect();
  }, 12000);

  auth.signInWithPopup(provider)
    .then(() => clearTimeout(fallbackTimer))
    .catch(err => {
      clearTimeout(fallbackTimer);
      if (err.code === 'auth/cancelled-popup-request' ||
          err.code === 'auth/popup-closed-by-user') {
        resetBtn();
        return;
      }
      if (err.code === 'auth/popup-blocked') {
        useRedirect();
        return;
      }
      resetBtn();
      console.error('signInWithPopup error:', err.code, err.message);
    })
    .finally(() => {
      if (_signingIn) resetBtn();
    });
}

// Обработка результата после redirect (fallback для браузеров где popup недоступен)
auth.getRedirectResult()
  .then(result => { if (result && result.user) console.log('redirect auth ok:', result.user.email); })
  .catch(() => {});

function signOut() {
  hideUserMenu();
  auth.signOut();
}

function showUserMenu() {
  const menu = document.getElementById('user-menu');
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

function hideUserMenu() {
  document.getElementById('user-menu').style.display = 'none';
}

function renderUserInfo() {
  if (!currentUser) return;
  const name = currentUser.displayName || 'Пользователь';
  const email = currentUser.email || '';
  const photo = currentUser.photoURL;

  const avatarImg = document.getElementById('user-avatar');
  const avatarInitials = document.getElementById('user-initials');
  if (photo) {
    avatarImg.src = photo;
    avatarImg.style.display = 'block';
    avatarInitials.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarInitials.textContent = name.charAt(0).toUpperCase();
    avatarInitials.style.display = 'block';
  }

  document.getElementById('user-menu-name').textContent = name;
  document.getElementById('user-menu-email').textContent = email;
  document.getElementById('app-subtitle').textContent = `Γεια σου, ${name.split(' ')[0]}!`;
}

// ============================================================
// STATE
// ============================================================
const DEFAULT_STATE = {
  streak: 0,
  lastPlayed: null,
  totalXp: 0,
  dailyXp: 0,
  dailyGoal: 50,
  level: 1,
  lessonsCompleted: 0,
  scenariosCompleted: [],
  errorLog: {},
  achievements: [],
  srs: {},  // { verbId: { interval, ef, due } }
  onboardingDone: false,
  vocabProgress: {},  // { categoryId: [greek, greek, ...] }
  currentLesson: 1
};

let state = { ...DEFAULT_STATE };

let lessonState = {
  exercises: [],
  currentIndex: 0,
  hearts: 3,
  xpEarned: 0,
  correct: 0,
  answered: false
};

let scenarioState = {
  scenarioId: null,
  currentStep: 0,
  score: 0,
  answered: false
};

const XP_PER_CORRECT = 10;
const XP_PER_SCENARIO_STEP = 15;
const EXERCISES_PER_LESSON = 10;

const GREEK_KEYS = [
  ['α','β','γ','δ','ε','ζ','η','θ'],
  ['ι','κ','λ','μ','ν','ξ','ο','π'],
  ['ρ','σ','ς','τ','υ','φ','χ','ψ','ω'],
];

const PRONOUNS = ["εγώ", "εσύ", "αυτός/ή/ό", "εμείς", "εσείς", "αυτοί/ές/ά"];
const PRONOUNS_RU = {
  "εγώ": "я", "εσύ": "ты", "αυτός/ή/ό": "он/она/оно",
  "εμείς": "мы", "εσείς": "вы", "αυτοί/ές/ά": "они"
};
// VERBS array in data.js contains mixed data — filter real verbs only
const VERBS_ONLY = VERBS.filter(v => v.infinitive);

const LESSON_VERBS_COUNT = 5;
function getLessonModules() {
  const modules = [];
  for (let i = 0; i < VERBS_ONLY.length; i += LESSON_VERBS_COUNT) {
    const num = Math.floor(i / LESSON_VERBS_COUNT) + 1;
    modules.push({ id: num, verbs: VERBS_ONLY.slice(i, i + LESSON_VERBS_COUNT) });
  }
  return modules;
}

let teachState = { module: null, cards: [], currentCard: 0 };

// ============================================================
// PERSISTENCE
// ============================================================
async function loadState() {
  // Сначала загружаем из localStorage как fallback
  try {
    const saved = localStorage.getItem('greek-app-state-v2');
    if (saved) state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
  } catch (e) { state = { ...DEFAULT_STATE }; }

  // Потом синхронизируем с Firestore (приоритет)
  if (currentUser) {
    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      if (doc.exists) {
        state = { ...DEFAULT_STATE, ...doc.data() };
        localStorage.setItem('greek-app-state-v2', JSON.stringify(state));
      }
    } catch (e) { console.error('Firestore load error:', e); }
  }
}

function saveState() {
  localStorage.setItem('greek-app-state-v2', JSON.stringify(state));
  if (currentUser) {
    db.collection('users').doc(currentUser.uid)
      .set(state)
      .catch(e => console.error('Firestore save error:', e));
  }
}

// ============================================================
// SUBSCRIPTION
// ============================================================

// Save email to Firestore so webhook can find user by email
async function saveUserEmail() {
  if (!currentUser?.email) return;
  try {
    await db.collection('users').doc(currentUser.uid).set(
      { email: currentUser.email.toLowerCase() },
      { merge: true }
    );
  } catch (e) { console.error('saveUserEmail error:', e); }
}

// Check subscription status: active / trialing = OK, else paywall
async function checkSubscription() {
  if (!currentUser) return false;

  // Developer account — always has access
  if (currentUser.email?.toLowerCase() === 'dondanilo1994@gmail.com') return true;

  // 1. Check users/{uid}.subscription (set by webhook)
  const ACTIVE_STATUSES = ['active', 'trialing', 'on_trial', 'paid'];

  const sub = state.subscription;
  if (sub && ACTIVE_STATUSES.includes(sub.status)) {
    return true;
  }

  // 2. Also check subscriptions/{email} as fallback
  try {
    const email = currentUser.email?.toLowerCase();
    if (email) {
      const doc = await db.collection('subscriptions').doc(email).get();
      if (doc.exists) {
        const s = doc.data();
        if (ACTIVE_STATUSES.includes(s.status)) {
          // Sync to state
          state.subscription = { status: s.status, ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}) };
          saveState();
          return true;
        }
      }
    }
  } catch (e) { console.error('checkSubscription error:', e); }

  return false;
}

function finishOnboarding() {
  state.onboardingDone = true;
  saveState();
  showScreen('screen-home');
  // Ask for push permission after onboarding — user is already engaged
  setTimeout(setupPushNotifications, 2000);
}

const VAPID_PUBLIC_KEY = 'BNxge42260O1eI9J5DPz4Wa2O-gKn5d8ScwU2-U1PvmGwtrNMrjxmRn6mIY2Ty4VGhXGsaxg8I7UPMfb5VsrKp4';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function setupPushNotifications() {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    if (currentUser) {
      await db.collection('push_subscriptions').doc(currentUser.uid).set({
        subscription: sub.toJSON(),
        uid: currentUser.uid,
        updatedAt: new Date().toISOString()
      });
    }
  } catch (e) { console.error('Push setup error:', e); }
}

// ============================================================
// PROGRESS DASHBOARD
// ============================================================
const LEAGUES = [
  { id: 'bronze',   name: 'Бронзовая лига',   icon: '🥉', min: 1,  max: 10,  color: '#CD7F32' },
  { id: 'silver',   name: 'Серебряная лига',   icon: '🥈', min: 11, max: 30,  color: '#A8A9AD' },
  { id: 'gold',     name: 'Золотая лига',      icon: '🥇', min: 31, max: 50,  color: '#FFD700' },
  { id: 'platinum', name: 'Платиновая лига',   icon: '💎', min: 51, max: 100, color: '#E5F0FF' },
];

function getLeague(level) {
  return LEAGUES.find(l => level >= l.min && level <= l.max) || LEAGUES[LEAGUES.length - 1];
}

let activeProgressTab = 'xp';

function showProgress(tab = 'xp') {
  activeProgressTab = tab;
  // Record start date if not set
  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
    saveState();
  }
  renderProgressXP();
  renderProgressLevel();
  renderProgressLessons();
  switchProgressTab(tab);
  showScreen('screen-progress');
}

function switchProgressTab(tab) {
  activeProgressTab = tab;
  ['xp', 'level', 'lessons'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`panel-${t}`).style.display = t === tab ? 'block' : 'none';
  });
}

function renderProgressXP() {
  const xp = state.totalXp;
  const level = state.level;
  const xpForLevel = (level - 1) * 500;
  const xpNextLevel = level * 500;
  const xpInLevel = xp - xpForLevel;
  const pct = Math.min(100, Math.round(xpInLevel / 500 * 100));

  document.getElementById('pg-total-xp').textContent = xp.toLocaleString('ru-RU');
  document.getElementById('pg-xp-bar').style.width = pct + '%';
  document.getElementById('pg-xp-bar-label').textContent =
    `${xpInLevel} / 500 XP до уровня ${level + 1}`;

  const days = state.startedAt
    ? Math.max(1, Math.ceil((Date.now() - new Date(state.startedAt).getTime()) / 86400000))
    : 1;
  document.getElementById('pg-xp-days').textContent = `${days} ${pluralDays(days)} в пути`;

  document.getElementById('pg-daily-xp').textContent = state.dailyXp || 0;
  document.getElementById('pg-streak-xp').textContent = state.streak || 0;
  const lessons = state.lessonsCompleted || 0;
  document.getElementById('pg-avg-xp').textContent = lessons > 0 ? Math.round(xp / lessons) : 0;
  document.getElementById('pg-goal-xp').textContent = state.dailyGoal || 50;
}

function renderProgressLevel() {
  const level = state.level;
  const league = getLeague(level);
  const nextLeague = LEAGUES[LEAGUES.indexOf(league) + 1];

  document.getElementById('pg-league-badge').textContent = league.icon;
  document.getElementById('pg-league-name').textContent = league.name;
  document.getElementById('pg-level-val').textContent = level;

  // Progress within league
  const leagueLen = league.max - league.min + 1;
  const inLeague = level - league.min;
  const pct = Math.round(inLeague / leagueLen * 100);
  document.getElementById('pg-league-bar').style.width = pct + '%';

  if (nextLeague) {
    document.getElementById('pg-league-progress-title').textContent =
      `Прогресс в лиге (${inLeague} / ${leagueLen} уровней)`;
    document.getElementById('pg-league-bar-label').textContent =
      `До ${nextLeague.name}: ${league.max - level + 1} уровней`;
  } else {
    document.getElementById('pg-league-progress-title').textContent = 'Максимальная лига!';
    document.getElementById('pg-league-bar-label').textContent = 'Ты достиг платинового уровня 💎';
  }

  // Highlight league rows
  LEAGUES.forEach(l => {
    const row = document.getElementById(`league-${l.id}`);
    const check = document.getElementById(`lcheck-${l.id}`);
    if (!row) return;
    row.classList.remove('current', 'done');
    if (l.id === league.id) { row.classList.add('current'); check.textContent = ''; }
    else if (level > l.max) { row.classList.add('done'); check.textContent = '✅'; }
    else { check.textContent = ''; }
  });
}

function renderProgressLessons() {
  const lessons = state.lessonsCompleted || 0;
  document.getElementById('pg-lessons-val').textContent = lessons;
  document.getElementById('pg-lessons-sub').textContent =
    `Это примерно ${Math.round(lessons * 5)} минут практики`;

  const milestones = [
    { n: 1,   icon: '🌱', title: 'Первый урок',       sub: 'Начало большого пути' },
    { n: 5,   icon: '🔥', title: '5 уроков',           sub: 'Войдёшь в ритм!' },
    { n: 10,  icon: '⭐', title: '10 уроков',          sub: 'Ты серьёзен!' },
    { n: 30,  icon: '🚀', title: '30 уроков',          sub: 'Месяц практики' },
    { n: 50,  icon: '💪', title: '50 уроков',          sub: 'Полпути к мастерству' },
    { n: 100, icon: '🏆', title: '100 уроков',         sub: 'Настоящий грек!' },
  ];
  const nextMilestone = milestones.find(m => m.n > lessons) || milestones[milestones.length - 1];
  document.getElementById('pg-milestones').innerHTML = milestones.map(m => `
    <div class="milestone-row ${lessons >= m.n ? 'done' : ''}">
      <div class="milestone-icon">${m.icon}</div>
      <div class="milestone-info">
        <div class="milestone-title">${m.title}</div>
        <div class="milestone-sub">${m.sub}</div>
      </div>
      <div class="milestone-check">${lessons >= m.n ? '✅' : `${m.n}`}</div>
    </div>`).join('');

  document.getElementById('pg-scenarios').textContent = (state.scenariosCompleted || []).length;
  const vocabLearned = Object.values(state.vocabProgress || {}).reduce((s, a) => s + a.length, 0);
  document.getElementById('pg-vocab-learned').textContent = vocabLearned;
  document.getElementById('pg-achievements').textContent = (state.achievements || []).length;
  document.getElementById('pg-streak-lessons').textContent = state.streak || 0;

  // Motivation
  const motivations = [
    { emoji: '🔥', text: `Ещё ${nextMilestone.n - lessons} уроков до «${nextMilestone.title}»`, sub: 'Ты почти там!' },
    { emoji: '🧠', text: `${vocabLearned} слов уже в голове`, sub: 'Каждое слово — шаг к гражданству' },
    { emoji: '⚡', text: `${state.totalXp} XP заработано`, sub: 'Продолжай — каждый урок считается' },
  ];
  const m = motivations[lessons % motivations.length];
  document.getElementById('pg-motivation').innerHTML = `
    <div class="progress-motivation-emoji">${m.emoji}</div>
    <div class="progress-motivation-text">${m.text}</div>
    <div class="progress-motivation-sub">${m.sub}</div>`;
}

function pluralDays(n) {
  if (n % 100 >= 11 && n % 100 <= 19) return 'дней';
  const r = n % 10;
  if (r === 1) return 'день';
  if (r >= 2 && r <= 4) return 'дня';
  return 'дней';
}

function showSettings() {
  // User info
  if (currentUser) {
    const name = currentUser.displayName || 'Пользователь';
    const email = currentUser.email || '';
    document.getElementById('settings-user-name').textContent = name;
    document.getElementById('settings-user-email').textContent = email;
    document.getElementById('settings-initials').textContent = name.charAt(0).toUpperCase();
    const avatarEl = document.getElementById('settings-avatar');
    const initialsEl = document.getElementById('settings-initials');
    if (currentUser.photoURL) {
      avatarEl.src = currentUser.photoURL;
      avatarEl.style.display = 'block';
      initialsEl.style.display = 'none';
    } else {
      avatarEl.style.display = 'none';
      initialsEl.style.display = 'flex';
    }
  }

  // Daily goal buttons
  document.querySelectorAll('.settings-goal-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.xp) === state.dailyGoal);
  });

  // Push toggle
  const pushOn = Notification.permission === 'granted';
  document.getElementById('push-toggle').classList.toggle('on', pushOn);

  // Stats
  document.getElementById('s-total-xp').textContent = state.totalXp;
  document.getElementById('s-lessons').textContent = state.lessonsCompleted;
  document.getElementById('s-streak').textContent = state.streak;
  const learnedCount = Object.values(state.vocabProgress || {}).reduce((sum, arr) => sum + arr.length, 0);
  document.getElementById('s-vocab').textContent = learnedCount;

  showScreen('screen-settings');
}

function setDailyGoal(xp) {
  state.dailyGoal = xp;
  saveState();
  document.querySelectorAll('.settings-goal-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.xp) === xp);
  });
  renderHome();
}

async function togglePushSetting() {
  if (Notification.permission === 'denied') {
    alert('Уведомления заблокированы в настройках браузера. Разрешите их вручную.');
    return;
  }
  if (Notification.permission === 'granted') {
    // Unsubscribe
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (currentUser) await db.collection('push_subscriptions').doc(currentUser.uid).delete().catch(() => {});
    document.getElementById('push-toggle').classList.remove('on');
  } else {
    await setupPushNotifications();
    document.getElementById('push-toggle').classList.toggle('on', Notification.permission === 'granted');
  }
}

function showPaywall() {
  const monthlyUrl = `https://izigreek.lemonsqueezy.com/checkout/buy/ba321ab1-7852-4b45-8d8b-a39393003582?checkout[custom][user_id]=${currentUser?.uid || ''}`;
  const annualUrl = `https://izigreek.lemonsqueezy.com/checkout/buy/81d18e92-cb61-46fb-b84c-63b5c903b15d?checkout[custom][user_id]=${currentUser?.uid || ''}`;

  document.getElementById('paywall-monthly-btn').href = monthlyUrl;
  document.getElementById('paywall-annual-btn').href = annualUrl;
  showScreen('screen-paywall');
}

// ============================================================
// INIT
// ============================================================
async function init() {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('sw.js').catch(() => null);

    // Reload when a new SW takes control (guarantees fresh files)
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    if (reg) {
      // When a new SW finishes installing, tell it to skip waiting immediately
      const onInstalled = (sw) => {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      };
      if (reg.installing) onInstalled(reg.installing);
      reg.addEventListener('updatefound', () => onInstalled(reg.installing));
    }
  }

  // Подписываемся на состояние авторизации
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      await loadState();
      await saveUserEmail();
      checkStreak();
      renderUserInfo();

      const hasAccess = await checkSubscription();
      if (hasAccess) {
        renderHome();
        if (!state.onboardingDone) {
          showScreen('screen-onboarding');
        } else {
          showScreen('screen-home');
          // Silently refresh push subscription for returning users
          if (Notification.permission === 'granted') {
            setTimeout(setupPushNotifications, 3000);
          }
        }
      } else {
        showPaywall();
      }
    } else {
      currentUser = null;
      showScreen('screen-login');
    }
  });
}

function checkStreak() {
  const today = new Date().toDateString();
  if (state.lastPlayed === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (state.lastPlayed !== yesterday.toDateString() && state.lastPlayed !== null) {
    state.streak = 0;
  }
  state.dailyXp = 0;
  saveState();
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  document.getElementById('streak-number').textContent = state.streak;
  document.getElementById('total-xp').textContent = state.totalXp;
  document.getElementById('level-display').textContent = state.level;
  document.getElementById('lessons-done').textContent = state.lessonsCompleted;

  const pct = Math.min(100, (state.dailyXp / state.dailyGoal) * 100);
  document.getElementById('daily-progress').style.width = pct + '%';
  document.getElementById('daily-xp-display').textContent = `${state.dailyXp} / ${state.dailyGoal} XP`;

  const card = document.getElementById('streak-card');
  card.classList.toggle('streak-zero', state.streak === 0);

  // Achievements counter
  if (!state.achievements) state.achievements = [];
  document.getElementById('ach-nav-count').textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;

  // Weak lesson button
  const weakCount = Object.keys(state.errorLog).length;
  const weakBtn = document.getElementById('weak-lesson-btn');
  if (weakBtn) {
    weakBtn.style.display = weakCount > 0 ? 'flex' : 'none';
    document.getElementById('weak-verbs-count').textContent = `${weakCount} ${weakCount === 1 ? 'глагол' : weakCount < 5 ? 'глагола' : 'глаголов'}`;
  }

  // SRS review button
  const dueCount = getSrsDueCount();
  const srsBtn = document.getElementById('srs-review-btn');
  if (srsBtn) {
    srsBtn.style.display = dueCount > 0 ? 'flex' : 'none';
    document.getElementById('srs-due-count').textContent = `${dueCount} ${dueCount === 1 ? 'глагол' : dueCount < 5 ? 'глагола' : 'глаголов'}`;
  }

  // Lesson button
  const mods = getLessonModules();
  const lessonNum = Math.min(state.currentLesson || 1, mods.length);
  const lessonBtnText = document.getElementById('lesson-btn-text');
  if (lessonBtnText) lessonBtnText.textContent = `Урок ${lessonNum} · ${LESSON_VERBS_COUNT} слов ▶`;
}

function showHome() {
  showScreen('screen-home');
  renderHome();
}

// ============================================================
// LESSON — EXERCISE GENERATION
// ============================================================
function generateLesson(verbPool = null) {
  const pool = verbPool || buildSrsPool();
  const exercises = [];
  for (let i = 0; i < EXERCISES_PER_LESSON; i++) {
    const verb = pool[Math.floor(Math.random() * pool.length)];
    const type = Math.floor(Math.random() * 5); // 0-3: multiple choice, 4: typing
    const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];

    if (type === 0) {
      const correct = verb.present[pronoun];
      exercises.push({
        type: 'conjugation', verb, pronoun,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongForms(verb, correct)])
      });
    } else if (type === 1) {
      const form = verb.present[pronoun];
      const correct = `${PRONOUNS_RU[pronoun]} ${verb.translation}`;
      exercises.push({
        type: 'phrase_meaning', verb,
        greek: `${pronoun} ${form}`,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongMeanings(verb, pronoun)])
      });
    } else if (type === 2) {
      const correct = verb.translation;
      const wrongs = VERBS_ONLY.filter(v => v.id !== verb.id).sort(() => Math.random() - 0.5).slice(0, 3).map(v => v.translation);
      exercises.push({
        type: 'word_meaning', verb, greek: verb.infinitive,
        correctAnswer: correct, options: shuffle([correct, ...wrongs])
      });
    } else if (type === 3) {
      const correct = verb.present[pronoun];
      exercises.push({
        type: 'translate_to_greek',
        russian: `${PRONOUNS_RU[pronoun]} ${verb.translation}`,
        verb, pronoun,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongForms(verb, correct)])
      });
    } else {
      // type === 4: typing
      const correct = verb.present[pronoun];
      exercises.push({
        type: 'typing',
        verb, pronoun,
        correctAnswer: correct
      });
    }
  }
  return exercises;
}

function getWrongForms(verb, correctForm) {
  const allForms = Object.values(verb.present).filter(f => f !== correctForm);
  if (allForms.length < 3) {
    const extra = VERBS_ONLY.find(v => v.id !== verb.id);
    allForms.push(...Object.values(extra.present).filter(f => f !== correctForm));
  }
  return shuffle(allForms).slice(0, 3);
}

function getWrongMeanings(verb, pronoun) {
  const pRu = PRONOUNS_RU[pronoun];
  return VERBS_ONLY.filter(v => v.id !== verb.id).sort(() => Math.random() - 0.5).slice(0, 3).map(v => `${pRu} ${v.translation}`);
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ============================================================
// LESSON — FLOW
// ============================================================
function startLesson() {
  const mods = getLessonModules();
  const num = Math.min(state.currentLesson || 1, mods.length);
  startTeachPhase(mods[num - 1]);
}

function startWeakLesson() {
  const weakIds = Object.keys(state.errorLog)
    .sort((a, b) => state.errorLog[b] - state.errorLog[a])
    .map(id => parseInt(id));
  const weakVerbs = VERBS_ONLY.filter(v => weakIds.includes(v.id));
  if (weakVerbs.length < 2) return;
  lessonState = {
    exercises: generateLesson(weakVerbs),
    currentIndex: 0, hearts: 3, xpEarned: 0, correct: 0, answered: false,
    isWeakMode: true
  };
  showScreen('screen-lesson');
  renderExercise();
}

function renderExercise() {
  const ex = lessonState.exercises[lessonState.currentIndex];
  lessonState.answered = false;

  document.getElementById('lesson-progress').style.width = (lessonState.currentIndex / EXERCISES_PER_LESSON * 100) + '%';
  renderHearts();
  document.getElementById('lesson-xp').textContent = lessonState.xpEarned;
  document.getElementById('lesson-footer').style.display = 'none';
  document.getElementById('lesson-footer').className = 'lesson-footer';

  const label = document.getElementById('exercise-label');
  const question = document.getElementById('exercise-question');
  const subtitle = document.getElementById('exercise-subtitle');

  if (ex.type === 'conjugation') {
    label.textContent = 'Выбери правильную форму';
    question.textContent = ex.verb.infinitive;
    subtitle.textContent = `${ex.pronoun}  (${PRONOUNS_RU[ex.pronoun]})  —  ${ex.verb.translation}`;
  } else if (ex.type === 'phrase_meaning') {
    label.textContent = 'Что это значит?';
    question.textContent = ex.greek;
    subtitle.textContent = '';
  } else if (ex.type === 'word_meaning') {
    label.textContent = 'Что значит этот глагол?';
    question.textContent = ex.greek;
    subtitle.textContent = '';
  } else if (ex.type === 'typing') {
    label.innerHTML = 'Напечатай форму <span class="label-badge">⌨️ сложно</span>';
    question.textContent = ex.verb.infinitive;
    subtitle.textContent = `${ex.pronoun}  (${PRONOUNS_RU[ex.pronoun]})  —  ${ex.verb.translation}`;
  } else {
    label.textContent = 'Переведи на греческий';
    question.textContent = ex.russian;
    subtitle.textContent = `${ex.verb.infinitive}  —  ${ex.verb.translation}`;
  }

  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  if (ex.type === 'typing') {
    renderTypingInput();
  } else {
    ex.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => selectAnswer(opt, ex.correctAnswer, ex.verb?.id));
      grid.appendChild(btn);
    });
  }
}

function renderTypingInput() {
  const grid = document.getElementById('options-grid');
  grid.innerHTML = `
    <div class="typing-wrap">
      <input type="text" id="typing-input" class="typing-input"
             placeholder="Введи форму глагола..."
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    </div>
    <div class="greek-keyboard">
      ${GREEK_KEYS.map(row => `
        <div class="gk-row">
          ${row.map(ch => `<button class="gk-btn" onclick="insertGreekChar('${ch}')">${ch}</button>`).join('')}
        </div>
      `).join('')}
      <div class="gk-row gk-bottom-row">
        <button class="gk-btn gk-space" onclick="insertGreekChar(' ')">·</button>
        <button class="gk-btn gk-backspace" onclick="insertGreekChar('⌫')">⌫</button>
        <button class="gk-btn gk-submit" onclick="checkTypingAnswer()">✓</button>
      </div>
    </div>
  `;
  const input = document.getElementById('typing-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') checkTypingAnswer(); });
  setTimeout(() => input.focus(), 50);
}

function insertGreekChar(char) {
  const input = document.getElementById('typing-input');
  if (!input || lessonState.answered) return;
  if (char === '⌫') {
    input.value = input.value.slice(0, -1);
  } else {
    input.value += char;
  }
  input.focus();
}

function normalizeGreek(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function checkTypingAnswer() {
  if (lessonState.answered) return;
  const ex = lessonState.exercises[lessonState.currentIndex];
  const input = document.getElementById('typing-input');
  if (!input) return;
  const userAnswer = input.value.trim();
  if (!userAnswer) { input.classList.add('typing-empty'); setTimeout(() => input.classList.remove('typing-empty'), 400); return; }

  lessonState.answered = true;
  input.disabled = true;

  const footer = document.getElementById('lesson-footer');
  const feedback = document.getElementById('feedback-message');
  const isCorrect = normalizeGreek(userAnswer) === normalizeGreek(ex.correctAnswer);
  if (ex.verb?.id) srsRate(ex.verb.id, isCorrect);

  if (isCorrect) {
    lessonState.correct++;
    lessonState.xpEarned += XP_PER_CORRECT;
    document.getElementById('lesson-xp').textContent = lessonState.xpEarned;
    feedback.textContent = randomCorrectPhrase();
    feedback.className = 'feedback-message correct';
    footer.className = 'lesson-footer correct-footer';
    input.classList.add('typing-correct');
    playSound('correct');
  } else {
    lessonState.hearts--;
    renderHearts();
    feedback.innerHTML = `Правильно: <strong>${ex.correctAnswer}</strong>`;
    feedback.className = 'feedback-message wrong';
    footer.className = 'lesson-footer wrong-footer';
    input.classList.add('typing-wrong');
    if (ex.verb?.id) state.errorLog[ex.verb.id] = (state.errorLog[ex.verb.id] || 0) + 1;
    playSound('wrong');
  }

  footer.style.display = 'flex';
  document.getElementById('continue-btn').textContent = lessonState.hearts <= 0 ? 'Завершить урок' : 'Продолжить';
}

function renderHearts() {
  const h = lessonState.hearts;
  document.getElementById('hearts-display').innerHTML =
    '<span class="heart-icon">❤️</span>'.repeat(h) +
    '<span class="heart-icon dead">🖤</span>'.repeat(3 - h);
}

function selectAnswer(selected, correct, verbId) {
  if (lessonState.answered) return;
  lessonState.answered = true;

  const buttons = document.querySelectorAll('#options-grid .option-btn');
  const footer = document.getElementById('lesson-footer');
  const feedback = document.getElementById('feedback-message');

  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) btn.classList.add('correct');
  });

  const isCorrect = selected === correct;
  if (verbId) srsRate(verbId, isCorrect);
  if (isCorrect) {
    lessonState.correct++;
    lessonState.xpEarned += XP_PER_CORRECT;
    document.getElementById('lesson-xp').textContent = lessonState.xpEarned;
    feedback.textContent = randomCorrectPhrase();
    feedback.className = 'feedback-message correct';
    footer.className = 'lesson-footer correct-footer';
    buttons.forEach(btn => { if (btn.textContent === selected) btn.classList.add('correct'); });
    playSound('correct');
  } else {
    lessonState.hearts--;
    renderHearts();
    feedback.innerHTML = `Правильно: <strong>${correct}</strong>`;
    feedback.className = 'feedback-message wrong';
    footer.className = 'lesson-footer wrong-footer';
    buttons.forEach(btn => { if (btn.textContent === selected) btn.classList.add('wrong'); });
    if (verbId) {
      state.errorLog[verbId] = (state.errorLog[verbId] || 0) + 1;
    }
    playSound('wrong');
  }

  footer.style.display = 'flex';
  document.getElementById('continue-btn').textContent = lessonState.hearts <= 0 ? 'Завершить урок' : 'Продолжить';
}

function nextExercise() {
  if (lessonState.hearts <= 0) { completeLesson(); return; }
  lessonState.currentIndex++;
  if (lessonState.currentIndex >= EXERCISES_PER_LESSON) completeLesson();
  else renderExercise();
}

function completeLesson() {
  const today = new Date().toDateString();
  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak = (state.lastPlayed === yesterday.toDateString()) ? state.streak + 1 : 1;
    state.lastPlayed = today;
  }
  state.dailyXp += lessonState.xpEarned;
  state.totalXp += lessonState.xpEarned;
  state.level = Math.floor(state.totalXp / 500) + 1;
  state.lessonsCompleted++;
  const isPerfect = lessonState.hearts === 3 && lessonState.correct === EXERCISES_PER_LESSON;
  if (lessonState.isWeakMode) {
    // Clear errors for verbs that were practiced
    const practicedIds = [...new Set(lessonState.exercises.filter(e => e.verb).map(e => e.verb.id))];
    practicedIds.forEach(id => { delete state.errorLog[id]; });
  }
  if (!lessonState.isWeakMode && !lessonState.isSrsMode) {
    const mods = getLessonModules();
    state.currentLesson = Math.min((state.currentLesson || 1) + 1, mods.length);
  }
  saveState();
  checkAchievements({ perfectLesson: isPerfect, weakMode: lessonState.isWeakMode });
  createPost('lesson_complete', {
    isPerfect,
    hearts: lessonState.hearts,
    correct: lessonState.correct,
    total: EXERCISES_PER_LESSON,
    xp: lessonState.xpEarned,
    streak: state.streak
  });

  const acc = lessonState.correct / EXERCISES_PER_LESSON;
  const stars = (lessonState.hearts === 3 && acc === 1) ? '⭐⭐⭐' : (lessonState.hearts >= 2 && acc >= 0.7) ? '⭐⭐' : lessonState.hearts >= 1 ? '⭐' : '😅';

  document.getElementById('complete-stars').textContent = stars;
  document.getElementById('complete-xp').textContent = `+${lessonState.xpEarned}`;
  document.getElementById('complete-correct').textContent = `${lessonState.correct}/${EXERCISES_PER_LESSON}`;
  document.getElementById('complete-hearts').textContent = lessonState.hearts;
  document.getElementById('complete-streak').textContent = state.streak;
  document.getElementById('complete-goal-msg').style.display = state.dailyXp >= state.dailyGoal ? 'block' : 'none';
  showScreen('screen-complete');
}

function randomCorrectPhrase() {
  return ['Σωστά! Правильно!', 'Μπράβο! Молодец!', 'Τέλεια! Отлично!', 'Ωραία! Прекрасно!', 'Εξαιρετικά!'][Math.floor(Math.random() * 5)];
}

// ============================================================
// TTS (TEXT-TO-SPEECH)
// ============================================================
function speakGreek(text, event) {
  if (event) event.stopPropagation();
  if (!('speechSynthesis' in window)) return;
  const doSpeak = () => {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'el-GR';
    utt.rate = 0.85;
    utt.pitch = 1;
    speechSynthesis.speak(utt);
  };
  if (speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    let fired = false;
    const go = () => { if (!fired) { fired = true; doSpeak(); } };
    speechSynthesis.addEventListener('voiceschanged', go, { once: true });
    setTimeout(go, 500);
  }
}

// ============================================================
// SPACED REPETITION (SRS)
// ============================================================
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function srsRate(verbId, isCorrect) {
  if (!state.srs) state.srs = {};
  const card = state.srs[verbId] || { interval: 0, ef: 2.5 };
  if (isCorrect) {
    if (card.interval === 0)      card.interval = 1;
    else if (card.interval === 1) card.interval = 4;
    else if (card.interval < 10)  card.interval = Math.round(card.interval * card.ef);
    else                          card.interval = Math.round(card.interval * card.ef);
    card.ef = Math.min(3.0, (card.ef || 2.5) + 0.1);
  } else {
    card.interval = 1;
    card.ef = Math.max(1.3, (card.ef || 2.5) - 0.2);
  }
  const due = new Date();
  due.setDate(due.getDate() + card.interval);
  card.due = due.toISOString().split('T')[0];
  state.srs[verbId] = card;
}

function getSrsDueVerbs() {
  if (!state.srs) return [];
  const today = todayStr();
  return VERBS_ONLY.filter(v => state.srs[v.id]?.due <= today);
}

function getSrsDueCount() {
  return getSrsDueVerbs().length;
}

function renderSrsStats() {
  if (!state.srs) state.srs = {};
  const total = VERBS_ONLY.length;
  const studied = Object.keys(state.srs).length;
  const dueCount = getSrsDueCount();
  const newCount = total - studied;
  const knownCount = studied - dueCount;
  return `
    <div class="srs-stats-grid">
      <div class="srs-stat srs-new"><span class="srs-stat-val">${newCount}</span><span class="srs-stat-lbl">Новых</span></div>
      <div class="srs-stat srs-due"><span class="srs-stat-val">${dueCount}</span><span class="srs-stat-lbl">К повторению</span></div>
      <div class="srs-stat srs-known"><span class="srs-stat-val">${knownCount}</span><span class="srs-stat-lbl">Изучено</span></div>
    </div>
    <div class="srs-bar-wrap">
      <div class="srs-bar" style="background:#e5e5e5; border-radius:8px; overflow:hidden; height:10px; margin-top:10px;">
        <div style="height:100%; width:${Math.round(knownCount/total*100)}%; background:#58CC02; display:inline-block; float:left;"></div>
        <div style="height:100%; width:${Math.round(dueCount/total*100)}%; background:#FF9600; display:inline-block; float:left;"></div>
      </div>
    </div>
    <div style="font-size:12px; color:#999; margin-top:6px;">${studied} из ${total} глаголов изучалось</div>
  `;
}

function buildSrsPool() {
  if (!state.srs) state.srs = {};
  const today = todayStr();
  const pool = [];
  VERBS_ONLY.forEach(v => {
    const card = state.srs[v.id];
    if (!card) {
      // Новый — среднее: 2x
      pool.push(v, v);
    } else if (card.due <= today) {
      // К повторению — высокий приоритет: 4x
      pool.push(v, v, v, v);
    } else {
      // Известный, не пора — низкий: 1x
      pool.push(v);
    }
  });
  return pool;
}

function startSrsLesson() {
  const dueVerbs = getSrsDueVerbs();
  if (dueVerbs.length === 0) return;
  const pool = dueVerbs.length >= 2 ? dueVerbs : null;
  lessonState = {
    exercises: generateLesson(pool),
    currentIndex: 0, hearts: 3, xpEarned: 0, correct: 0,
    answered: false, isWeakMode: false, isSrsMode: true
  };
  showScreen('screen-lesson');
  renderExercise();
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
let achToastQueue = [];

// Сколько слов выучено суммарно по всем категориям словаря
function vocabWordsLearned() {
  return Object.values(state.vocabProgress || {}).reduce((sum, arr) => sum + arr.length, 0);
}

// Сколько категорий словаря пройдено целиком
function vocabCategoriesCompleted() {
  return VOCAB_CATEGORIES.filter(cat => {
    const learned = (state.vocabProgress || {})[cat.id] || [];
    return learned.length >= cat.words.length;
  }).length;
}

function checkAchievements(ctx = {}) {
  if (!state.achievements) state.achievements = [];
  const vocabWords = vocabWordsLearned();
  const vocabCats = vocabCategoriesCompleted();
  const srsCount = Object.keys(state.srs || {}).length;
  const conditions = {
    'first_lesson':   state.lessonsCompleted >= 1,
    'perfect_lesson': ctx.perfectLesson === true,
    'lessons_5':      state.lessonsCompleted >= 5,
    'lessons_10':     state.lessonsCompleted >= 10,
    'lessons_30':     state.lessonsCompleted >= 30,
    'lessons_50':     state.lessonsCompleted >= 50,
    'lessons_100':    state.lessonsCompleted >= 100,
    'streak_3':       state.streak >= 3,
    'streak_7':       state.streak >= 7,
    'streak_14':      state.streak >= 14,
    'streak_30':      state.streak >= 30,
    'streak_60':      state.streak >= 60,
    'streak_100':     state.streak >= 100,
    'scenario_first': state.scenariosCompleted.length >= 1,
    'scenarios_5':    state.scenariosCompleted.length >= 5,
    'scenarios_10':   state.scenariosCompleted.length >= 10,
    'scenarios_all':  state.scenariosCompleted.length >= SCENARIOS.length,
    'citizenship':    state.scenariosCompleted.includes('kep'),
    'vocab_100':      vocabWords >= 100,
    'vocab_500':      vocabWords >= 500,
    'vocab_1000':     vocabWords >= 1000,
    'vocab_2000':     vocabWords >= 2000,
    'vocab_cat_1':    vocabCats >= 1,
    'vocab_cat_10':   vocabCats >= 10,
    'vocab_cat_all':  vocabCats >= VOCAB_CATEGORIES.length,
    'srs_50':         srsCount >= 50,
    'srs_150':        srsCount >= 150,
    'srs_300':        srsCount >= 300,
    'weak_conquered': ctx.weakMode === true,
    'xp_500':         state.totalXp >= 500,
    'xp_2000':        state.totalXp >= 2000,
    'xp_5000':        state.totalXp >= 5000,
    'xp_10000':       state.totalXp >= 10000,
    'level_5':        state.level >= 5,
    'level_10':       state.level >= 10,
    'level_20':       state.level >= 20,
  };
  const newlyUnlocked = [];
  for (const [id, met] of Object.entries(conditions)) {
    if (met && !state.achievements.includes(id)) {
      state.achievements.push(id);
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (ach) newlyUnlocked.push(ach);
    }
  }
  if (newlyUnlocked.length > 0) {
    saveState();
    newlyUnlocked.forEach(a => {
      achToastQueue.push(a);
      createPost('achievement', { icon: a.icon, title: a.title, desc: a.desc });
    });
    if (achToastQueue.length === newlyUnlocked.length) processAchToast();
  }

  // Streak milestones
  const streakMilestones = [3, 7, 14, 30, 60, 100];
  if (streakMilestones.includes(state.streak)) {
    const key = `streak_posted_${state.streak}`;
    if (!state[key]) {
      state[key] = true;
      saveState();
      createPost('streak', { streak: state.streak });
    }
  }
}

function processAchToast() {
  if (!achToastQueue.length) return;
  const ach = achToastQueue[0];
  const toast = document.getElementById('achievement-toast');
  document.getElementById('toast-icon').textContent = ach.icon;
  document.getElementById('toast-title').textContent = ach.title;
  document.getElementById('toast-desc').textContent = ach.desc;
  toast.classList.add('show');
  playSound('correct');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      achToastQueue.shift();
      processAchToast();
    }, 500);
  }, 3200);
}

function showAchievements() {
  if (!state.achievements) state.achievements = [];
  const unlocked = state.achievements.length;
  const total = ACHIEVEMENTS.length;
  document.getElementById('ach-badge').textContent = `${unlocked}/${total}`;

  const container = document.getElementById('achievements-container');
  const byCategory = {};
  ACHIEVEMENTS.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  container.innerHTML = Object.entries(byCategory).map(([cat, achs]) => `
    <div class="ach-category">
      <div class="ach-category-title">${cat}</div>
      ${achs.map(a => {
        const isUnlocked = state.achievements.includes(a.id);
        return `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <div class="ach-icon">${isUnlocked ? a.icon : '🔒'}</div>
          <div class="ach-info">
            <div class="ach-title">${a.title}</div>
            <div class="ach-desc">${a.desc}</div>
          </div>
          ${isUnlocked ? '<div class="ach-check">✓</div>' : ''}
        </div>`;
      }).join('')}
    </div>
  `).join('');

  showScreen('screen-achievements');
}

// ============================================================
// SOUND
// ============================================================
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'correct') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
    }
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

// ============================================================
// SCENARIOS
// ============================================================
function showScenarios() {
  const container = document.getElementById('scenarios-list');
  container.innerHTML = SCENARIOS.map(s => {
    const done = state.scenariosCompleted.includes(s.id);
    return `
    <div class="scenario-card ${done ? 'done' : ''}" onclick="startScenario('${s.id}')">
      <div class="scenario-icon">${s.icon}</div>
      <div class="scenario-info">
        <div class="scenario-title">${s.title}</div>
        <div class="scenario-desc">${s.description}</div>
        <div class="scenario-meta">${s.steps.length} шага · ${s.steps.length * XP_PER_SCENARIO_STEP} XP</div>
      </div>
      <div class="scenario-arrow">${done ? '✅' : '→'}</div>
    </div>`;
  }).join('');
  showScreen('screen-scenarios');
}

function startScenario(id) {
  const scenario = SCENARIOS.find(s => s.id === id);
  if (!scenario) return;
  scenarioState = { scenarioId: id, currentStep: 0, score: 0, answered: false };
  renderScenarioStep(scenario, 0);
  showScreen('screen-scenario-detail');
}

function renderScenarioStep(scenario, stepIdx) {
  scenarioState.answered = false;
  const step = scenario.steps[stepIdx];
  const total = scenario.steps.length;

  document.getElementById('scenario-progress-fill').style.width = (stepIdx / total * 100) + '%';
  document.getElementById('scenario-step-counter').textContent = `${stepIdx + 1}/${total}`;
  document.getElementById('scenario-title-bar').textContent = scenario.title;

  const container = document.getElementById('scenario-step-container');
  container.innerHTML = `
    <div class="scenario-situation">${step.situation}</div>
    <div class="dialogue-card">
      <div class="dialogue-speaker">${step.speaker} говорит:</div>
      <div class="dialogue-greek-wrap">
        <div class="dialogue-greek">${step.greek}</div>
        <button class="speak-btn-lg" data-speak="${step.greek.replace(/"/g, '&quot;')}" onclick="speakGreek(this.dataset.speak)">🔊</button>
      </div>
      <div class="dialogue-transcription">${step.transcription}</div>
      <div class="dialogue-translation">${step.translation}</div>
    </div>
    <div class="scenario-question">${step.question}</div>
    <div class="scenario-options" id="scenario-options">
      ${step.options.map((opt, i) => `
        <button class="scenario-option-btn" onclick="selectScenarioAnswer(${i})">
          <div class="opt-greek">${opt.text}</div>
          <div class="opt-transcription">🔊 ${opt.transcription}</div>
          <div class="opt-translation">${opt.translation}</div>
        </button>
      `).join('')}
    </div>
    <div class="scenario-feedback" id="scenario-feedback" style="display:none"></div>
    <button class="btn-primary" id="scenario-next-btn" onclick="nextScenarioStep()" style="display:none;margin-top:16px">
      ${stepIdx < total - 1 ? 'Следующий шаг →' : 'Завершить сценарий'}
    </button>
  `;
}

function selectScenarioAnswer(optionIdx) {
  if (scenarioState.answered) return;
  scenarioState.answered = true;

  const scenario = SCENARIOS.find(s => s.id === scenarioState.scenarioId);
  const step = scenario.steps[scenarioState.currentStep];
  const option = step.options[optionIdx];

  const buttons = document.querySelectorAll('.scenario-option-btn');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (step.options[i].correct) btn.classList.add('correct');
  });

  const feedback = document.getElementById('scenario-feedback');
  if (option.correct) {
    scenarioState.score++;
    buttons[optionIdx].classList.add('correct');
    feedback.className = 'scenario-feedback correct';
    feedback.textContent = step.correctFeedback;
    playSound('correct');
  } else {
    buttons[optionIdx].classList.add('wrong');
    feedback.className = 'scenario-feedback wrong';
    feedback.textContent = step.wrongFeedback;
    playSound('wrong');
  }

  feedback.style.display = 'block';
  document.getElementById('scenario-next-btn').style.display = 'block';
}

function nextScenarioStep() {
  const scenario = SCENARIOS.find(s => s.id === scenarioState.scenarioId);
  scenarioState.currentStep++;

  if (scenarioState.currentStep >= scenario.steps.length) {
    completeScenario(scenario);
  } else {
    renderScenarioStep(scenario, scenarioState.currentStep);
  }
}

function completeScenario(scenario) {
  const xp = scenarioState.score * XP_PER_SCENARIO_STEP;
  state.totalXp += xp;
  state.dailyXp += xp;
  state.level = Math.floor(state.totalXp / 500) + 1;
  if (!state.scenariosCompleted.includes(scenario.id)) {
    state.scenariosCompleted.push(scenario.id);
  }
  const today = new Date().toDateString();
  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak = (state.lastPlayed === yesterday.toDateString()) ? state.streak + 1 : 1;
    state.lastPlayed = today;
  }
  saveState();
  checkAchievements({});

  const total = scenario.steps.length;
  const pct = scenarioState.score / total;
  const stars = pct === 1 ? '⭐⭐⭐' : pct >= 0.67 ? '⭐⭐' : '⭐';

  document.getElementById('scenario-complete-icon').textContent = scenario.icon;
  document.getElementById('scenario-complete-title').textContent = `${scenario.title} пройден!`;
  document.getElementById('scenario-complete-stars').textContent = stars;
  document.getElementById('scenario-score').textContent = `${scenarioState.score}/${total}`;
  document.getElementById('scenario-xp').textContent = `+${xp} XP`;
  document.getElementById('scenario-complete-msg').textContent =
    pct === 1 ? 'Идеально! Ты готов к этой ситуации в реальной жизни.' :
    pct >= 0.67 ? 'Хорошо! Ещё немного практики — и будет идеально.' :
    'Не страшно. Повтори сценарий — с каждым разом лучше.';

  showScreen('screen-scenario-complete');
}

// ============================================================
// VERB TABLE
// ============================================================
function renderVerbCards(verbs) {
  const pronounsRu = ['я', 'ты', 'он/она', 'мы', 'вы', 'они'];
  const container = document.getElementById('verb-table-container');
  document.getElementById('verb-count-badge').textContent = verbs.length;

  if (verbs.length === 0) {
    container.innerHTML = '<div class="no-results">Ничего не найдено 🤷</div>';
    return;
  }

  container.innerHTML = verbs.map(verb => `
    <div class="verb-card" onclick="this.classList.toggle('expanded')">
      <div class="verb-title">
        <div>
          <span class="verb-infinitive">${verb.infinitive}</span>
          <span class="verb-transcription"> [${verb.transcription}]</span>
        </div>
        <span class="verb-translation-badge">${verb.translation}</span>
      </div>
      ${verb.note ? `<div class="verb-note">${verb.note}</div>` : ''}
      <div class="verb-example">
        <button class="speak-btn" data-speak="${verb.example.greek}" onclick="speakGreek(this.dataset.speak, event)" title="Произнести">🔊</button>
        <span class="example-greek">${verb.example.greek}</span>
        <span class="example-ru">${verb.example.ru}</span>
      </div>
      <div class="verb-conjugation">
        ${PRONOUNS.map((p, i) => `
          <div class="conj-row">
            <span class="conj-pronoun">${pronounsRu[i]}</span>
            <span class="conj-form conj-speakable" onclick="speakGreek('${verb.present[p]}', event)" title="Нажми — услышишь">${verb.present[p]}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function filterVerbs(query) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? VERBS_ONLY.filter(v =>
        v.infinitive.toLowerCase().includes(q) ||
        v.translation.toLowerCase().includes(q) ||
        Object.values(v.present).some(f => f.toLowerCase().includes(q))
      )
    : VERBS_ONLY;
  renderVerbCards(filtered);
}

function showVerbTable() {
  document.getElementById('verb-search').value = '';
  renderVerbCards(VERBS_ONLY);
  showScreen('screen-verbs');
}

// ============================================================
// PHRASES & EXPRESSIONS
// ============================================================
function showPhrases() {
  // Category pills
  const catsEl = document.getElementById('phrase-cats');
  catsEl.innerHTML = PHRASES.map(cat => `
    <button class="phrase-cat-pill" onclick="scrollToPhraseCat('${cat.id}')" style="border-color:${cat.color};color:${cat.color}">
      ${cat.icon} ${cat.category}
    </button>
  `).join('');

  // All phrases
  const container = document.getElementById('phrases-container');
  container.innerHTML = PHRASES.map(cat => `
    <div class="phrase-category-block" id="phrase-cat-${cat.id}">
      <div class="phrase-cat-header" style="border-color:${cat.color}">
        <span class="phrase-cat-icon">${cat.icon}</span>
        <span class="phrase-cat-title" style="color:${cat.color}">${cat.category}</span>
        <span class="phrase-cat-count">${cat.phrases.length}</span>
      </div>
      ${cat.phrases.map(p => `
        <div class="phrase-card">
          <div class="phrase-top">
            <div class="phrase-greek" data-speak="${p.greek.replace(/"/g,'&quot;')}"
                 onclick="speakGreek(this.dataset.speak)">${p.greek}</div>
            <button class="speak-btn" data-speak="${p.greek.replace(/"/g,'&quot;')}"
                    onclick="speakGreek(this.dataset.speak, event)">🔊</button>
          </div>
          <div class="phrase-transcription">${p.transcription}</div>
          <div class="phrase-translation">${p.translation}</div>
          ${p.note ? `<div class="phrase-note">${p.note}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  // Reset search
  const si = document.getElementById('phrases-search');
  if (si) si.value = '';
  searchPhrases('');

  showScreen('screen-phrases');
}

function searchPhrases(query) {
  const q = query.trim().toLowerCase();
  const resultsEl = document.getElementById('phrases-search-results');
  const normalEl = document.getElementById('phrases-container');
  const catsEl = document.getElementById('phrase-cats');
  const descEl = document.getElementById('phrases-sub-desc');

  if (!q) {
    resultsEl.style.display = 'none';
    normalEl.style.display = '';
    catsEl.style.display = '';
    descEl.style.display = '';
    return;
  }

  normalEl.style.display = 'none';
  catsEl.style.display = 'none';
  descEl.style.display = 'none';
  resultsEl.style.display = '';

  const matches = [];
  PHRASES.forEach(cat => {
    cat.phrases.forEach(p => {
      if (
        p.greek.toLowerCase().includes(q) ||
        p.transcription.toLowerCase().includes(q) ||
        p.translation.toLowerCase().includes(q) ||
        (p.note && p.note.toLowerCase().includes(q))
      ) {
        matches.push({ ...p, catIcon: cat.icon, catTitle: cat.category, catColor: cat.color });
      }
    });
  });

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="search-empty">Ничего не найдено</div>`;
    return;
  }

  resultsEl.innerHTML = matches.map(p => `
    <div class="phrase-card">
      <div class="phrase-search-cat" style="color:${p.catColor}">${p.catIcon} ${p.catTitle}</div>
      <div class="phrase-top">
        <div class="phrase-greek" data-speak="${p.greek.replace(/"/g,'&quot;')}"
             onclick="speakGreek(this.dataset.speak)">${p.greek}</div>
        <button class="speak-btn" data-speak="${p.greek.replace(/"/g,'&quot;')}"
                onclick="speakGreek(this.dataset.speak, event)">🔊</button>
      </div>
      <div class="phrase-transcription">${p.transcription}</div>
      <div class="phrase-translation">${p.translation}</div>
      ${p.note ? `<div class="phrase-note">${p.note}</div>` : ''}
    </div>
  `).join('');
}

function scrollToPhraseCat(id) {
  const el = document.getElementById('phrase-cat-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Highlight active pill
  document.querySelectorAll('.phrase-cat-pill').forEach(p => p.classList.remove('active'));
  const pills = document.querySelectorAll('.phrase-cat-pill');
  const idx = PHRASES.findIndex(c => c.id === id);
  if (pills[idx]) pills[idx].classList.add('active');
}

// ============================================================
// DAILY GOAL SETTINGS
// ============================================================
function showGoalModal() {
  document.querySelectorAll('.goal-option-btn').forEach(btn => {
    const isActive = parseInt(btn.dataset.xp) === state.dailyGoal;
    btn.classList.toggle('active', isActive);
  });
  document.getElementById('goal-modal').style.display = 'flex';
}

function hideGoalModal() {
  document.getElementById('goal-modal').style.display = 'none';
}

function setDailyGoal(xp) {
  state.dailyGoal = xp;
  saveState();
  renderHome();
  hideGoalModal();
}

// ============================================================
// 30-DAY PLAN
// ============================================================
function showPlan() {
  const lessonsNeededPerDay = 1;
  const daysUnlocked = Math.min(30, state.lessonsCompleted + state.scenariosCompleted.length + 1);

  const typeIcons = { vocab: '📖', grammar: '⚙️', scenario: '🎭', review: '🔄', audit: '📊' };
  const typeLabels = { vocab: 'Лексика', grammar: 'Грамматика', scenario: 'Сценарий', review: 'Повторение', audit: 'Аудит' };

  const container = document.getElementById('plan-container');
  container.innerHTML = PLAN_30.map(week => `
    <div class="week-block">
      <div class="week-header" style="border-color:${week.color}">
        <span class="week-number" style="color:${week.color}">Неделя ${week.week}</span>
        <span class="week-theme">${week.theme}</span>
      </div>
      ${week.days.map(d => {
        const isUnlocked = d.day <= daysUnlocked;
        const isDone = d.day < daysUnlocked;
        return `
        <div class="plan-day ${isDone ? 'done' : ''} ${!isUnlocked ? 'locked' : ''}">
          <div class="plan-day-num" style="background:${isDone ? week.color : isUnlocked ? 'white' : '#e5e5e5'};color:${isDone ? 'white' : '#3c3c3c'}">${d.day}</div>
          <div class="plan-day-info">
            <div class="plan-day-topic">${d.topic}</div>
            <div class="plan-day-focus">${typeIcons[d.type]} ${typeLabels[d.type]} · ${d.focus}</div>
          </div>
          <div class="plan-day-status">${isDone ? '✅' : isUnlocked ? '▶' : '🔒'}</div>
        </div>`;
      }).join('')}
    </div>
  `).join('');

  showScreen('screen-plan');
}

// ============================================================
// AUDIT / PROGRESS
// ============================================================
function showAudit() {
  const container = document.getElementById('audit-container');

  const totalErrors = Object.values(state.errorLog).reduce((a, b) => a + b, 0);
  const weakVerbs = Object.entries(state.errorLog)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const verb = VERBS_ONLY.find(v => v.id === parseInt(id));
      return verb ? `<div class="weak-verb-row"><span class="wv-infinitive">${verb.infinitive}</span><span class="wv-translation">${verb.translation}</span><span class="wv-errors">${count} ошиб.</span></div>` : '';
    }).join('');

  const accuracy = state.lessonsCompleted > 0
    ? Math.round((1 - totalErrors / (state.lessonsCompleted * EXERCISES_PER_LESSON)) * 100)
    : 100;

  const daysToGoal = state.dailyGoal > 0
    ? Math.max(0, Math.ceil((state.dailyGoal - state.dailyXp) / XP_PER_CORRECT))
    : 0;

  container.innerHTML = `
    <div class="audit-grid">
      <div class="audit-stat">
        <div class="audit-stat-icon">⚡</div>
        <div class="audit-stat-value">${state.totalXp}</div>
        <div class="audit-stat-label">Всего XP</div>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-icon">🔥</div>
        <div class="audit-stat-value">${state.streak}</div>
        <div class="audit-stat-label">Дней подряд</div>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-icon">📝</div>
        <div class="audit-stat-value">${state.lessonsCompleted}</div>
        <div class="audit-stat-label">Уроков</div>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-icon">🎭</div>
        <div class="audit-stat-value">${state.scenariosCompleted.length}/${SCENARIOS.length}</div>
        <div class="audit-stat-label">Сценариев</div>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-icon">🎯</div>
        <div class="audit-stat-value">${accuracy}%</div>
        <div class="audit-stat-label">Точность</div>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-icon">⭐</div>
        <div class="audit-stat-value">${state.level}</div>
        <div class="audit-stat-label">Уровень</div>
      </div>
    </div>

    <div class="audit-section">
      <div class="audit-section-title">📈 До следующего уровня</div>
      <div class="level-progress-bar">
        <div class="level-progress-fill" style="width:${((state.totalXp % 500) / 500 * 100)}%"></div>
      </div>
      <div class="level-progress-label">${state.totalXp % 500} / 500 XP до уровня ${state.level + 1}</div>
    </div>

    ${Object.keys(state.errorLog).length > 0 ? `
    <div class="audit-section">
      <div class="audit-section-title">⚠️ Слабые места — повтори эти глаголы</div>
      <div class="weak-verbs-list">${weakVerbs}</div>
    </div>` : `
    <div class="audit-section">
      <div class="audit-section-title">✅ Слабых мест нет — продолжай в том же духе!</div>
    </div>`}

    <div class="audit-section">
      <div class="audit-section-title">🧠 Интервальное повторение (SRS)</div>
      ${renderSrsStats()}
    </div>

    <div class="audit-section">
      <div class="audit-section-title">💡 Рекомендация тьютора</div>
      <div class="tutor-tip">${getTutorTip()}</div>
    </div>
  `;

  showScreen('screen-audit');
}

function getTutorTip() {
  if (state.lessonsCompleted === 0) return 'Данил, начни с первого урока прямо сейчас! Каждый день — это вклад в гражданство. 🇬🇷';
  if (state.streak === 0) return 'Стрик сброшен. Помни: регулярность важнее интенсивности. 10 минут в день > 2 часа раз в неделю.';
  if (state.scenariosCompleted.length === 0) return 'Попробуй сценарий "Apple Store" или "Собеседование на гражданство" — это практика для реальной жизни!';
  if (!state.scenariosCompleted.includes('citizenship')) return `Пройдено ${state.scenariosCompleted.length}/${SCENARIOS.length} сценариев. Сценарий "Собеседование на гражданство" — самый важный. Пройди его!`;
  if (state.scenariosCompleted.length < SCENARIOS.length) return `Пройдено ${state.scenariosCompleted.length}/${SCENARIOS.length} сценариев. Попробуй аптеку, банк и ΚΕΠ — реальные ситуации в Греции!`;
  return 'Отлично! Все 8 сценариев пройдены. Следующий шаг — говорить с носителями. Найди грека и практикуй!';
}

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ============================================================
// SCROLL TO TOP
// ============================================================
(function() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
})();

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// SUPPORT FORM
// ============================================================
function showSupportForm() {
  const modal = document.getElementById('support-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Pre-fill name/email from current user
  if (currentUser) {
    const nameEl = document.getElementById('sf-name');
    const emailEl = document.getElementById('sf-email');
    if (nameEl && !nameEl.value) nameEl.value = currentUser.displayName || '';
    if (emailEl && !emailEl.value) emailEl.value = currentUser.email || '';
  }
}

function hideSupportForm() {
  document.getElementById('support-modal').style.display = 'none';
  document.body.style.overflow = '';
  // Reset form
  document.getElementById('support-form-wrap').style.display = 'block';
  document.getElementById('support-success').style.display = 'none';
}

function showPwaGuide() {
  document.getElementById('pwa-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function hidePwaGuide() {
  document.getElementById('pwa-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitSupportForm() {
  const name    = document.getElementById('sf-name').value.trim();
  const email   = document.getElementById('sf-email').value.trim();
  const phone   = document.getElementById('sf-phone').value.trim();
  const subject = document.getElementById('sf-subject').value;
  const message = document.getElementById('sf-message').value.trim();

  if (!name || !email || !subject || !message) {
    alert('Пожалуйста, заполните все обязательные поля.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Введите корректный email.');
    return;
  }

  const btn = document.querySelector('.support-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Отправляем...';

  try {
    const res = await fetch('https://izigreek-webhook.vercel.app/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, subject, message,
        userId: currentUser?.uid || '' })
    });
    if (!res.ok) throw new Error('Server error ' + res.status);
    document.getElementById('support-form-wrap').style.display = 'none';
    document.getElementById('support-success').style.display = 'block';
  } catch (e) {
    console.error('Support form error:', e);
    alert('Не удалось отправить. Попробуйте позже или напишите напрямую: support@izigreek.com');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить';
  }
}

// ============================================================
// SOCIAL FEED
// ============================================================
let feedUnsubscribe = null;
let composerFile = null;

function showFeed() {
  showScreen('screen-feed');
  hideFeedBadge();
  renderComposerAvatar();
  initComposer();
  loadFeed();
}

function initComposer() {
  const ta = document.getElementById('composer-text');
  if (!ta || ta._composerInited) return;
  ta._composerInited = true;
  ta.addEventListener('input', onComposerInput);
}

function renderComposerAvatar() {
  const wrap = document.getElementById('composer-avatar-wrap');
  if (!wrap || !currentUser) return;
  if (currentUser.photoURL) {
    wrap.innerHTML = `<img class="feed-avatar" src="${currentUser.photoURL}" alt="" style="margin-top:4px">`;
  } else {
    wrap.innerHTML = `<div class="feed-avatar-initials" style="margin-top:4px">${getInitials(currentUser.displayName)}</div>`;
  }
}

function onComposerInput() {
  const ta = document.getElementById('composer-text');
  const counter = document.getElementById('composer-char-count');
  const btn = document.getElementById('composer-submit');
  const len = ta.value.length;
  counter.textContent = len > 0 ? `${len} / 1000` : '';
  counter.className = 'composer-char-count' + (len >= 1000 ? ' limit' : len >= 800 ? ' warn' : '');
  btn.disabled = len === 0 && !composerFile;
}

function onComposerFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('Файл слишком большой. Максимум 10 МБ.');
    input.value = '';
    return;
  }
  composerFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('composer-preview-img').src = e.target.result;
    document.getElementById('composer-image-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
  document.querySelector('.composer-attach-btn').classList.add('has-image');
  document.getElementById('composer-submit').disabled = false;
}

function removeComposerImage() {
  composerFile = null;
  document.getElementById('composer-file-input').value = '';
  document.getElementById('composer-image-preview').style.display = 'none';
  document.getElementById('composer-preview-img').src = '';
  document.querySelector('.composer-attach-btn')?.classList.remove('has-image');
  onComposerInput();
}

async function submitPost() {
  if (!currentUser) return;
  const ta = document.getElementById('composer-text');
  const text = ta.value.trim();
  if (!text && !composerFile) return;

  const btn = document.getElementById('composer-submit');
  btn.classList.add('loading');
  btn.textContent = 'Публикуем...';

  try {
    let imageUrl = null;
    if (composerFile) {
      const ext = composerFile.name.split('.').pop();
      const path = `posts/${currentUser.uid}/${Date.now()}.${ext}`;
      const ref = storage.ref(path);
      await ref.put(composerFile);
      imageUrl = await ref.getDownloadURL();
    }

    await db.collection('posts').add({
      uid: currentUser.uid,
      displayName: currentUser.displayName || 'Ученик',
      photoURL: currentUser.photoURL || null,
      type: 'user_post',
      emoji: '✍️',
      title: text || '',
      subtitle: '',
      imageUrl: imageUrl || null,
      chips: [],
      likes: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Reset composer
    ta.value = '';
    removeComposerImage();
    onComposerInput();
  } catch (e) {
    console.error('submitPost error:', e);
    alert('Не удалось опубликовать. Попробуй ещё раз.');
  } finally {
    btn.classList.remove('loading');
    btn.textContent = 'Опубликовать';
  }
}

function hideFeedBadge() {
  document.getElementById('feed-nav-badge').style.display = 'none';
}

function showFeedBadge() {
  const badge = document.getElementById('feed-nav-badge');
  const currentScreen = document.querySelector('.screen.active');
  if (currentScreen && currentScreen.id === 'screen-feed') return;
  badge.style.display = 'block';
}

function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  if (feedUnsubscribe) {
    feedUnsubscribe();
    feedUnsubscribe = null;
  }

  container.innerHTML = '<div class="feed-loading">Загружаем ленту...</div>';

  feedUnsubscribe = db.collection('posts')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snapshot => {
      // Note: requires Firestore index on createdAt desc — auto-created on first query
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="feed-empty">
            <div class="feed-empty-icon">🌱</div>
            <div class="feed-empty-text">Лента пока пустая</div>
            <div class="feed-empty-sub">Пройди урок или квиз — и твой результат появится здесь!</div>
          </div>`;
        return;
      }

      const isFirstLoad = container.querySelector('.feed-loading');
      const newPostIds = new Set();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !isFirstLoad) newPostIds.add(change.doc.id);
      });

      if (newPostIds.size > 0 && !isFirstLoad) showFeedBadge();

      container.innerHTML = '';
      snapshot.forEach(doc => {
        container.appendChild(renderFeedCard(doc.id, doc.data()));
      });
    }, err => {
      console.error('Feed error:', err);
      // Fallback: load without ordering (index may not exist yet)
      db.collection('posts').limit(50).get().then(snap => {
        if (snap.empty) {
          container.innerHTML = `<div class="feed-empty"><div class="feed-empty-icon">🌱</div><div class="feed-empty-text">Лента пока пустая</div><div class="feed-empty-sub">Пройди урок или квиз!</div></div>`;
          return;
        }
        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
        docs.sort((a, b) => (b.data.createdAt?.seconds || 0) - (a.data.createdAt?.seconds || 0));
        container.innerHTML = '';
        docs.forEach(d => container.appendChild(renderFeedCard(d.id, d.data)));
      }).catch(() => {
        container.innerHTML = '<div class="feed-loading">Не удалось загрузить ленту</div>';
      });
    });
}

function renderFeedCard(docId, post) {
  const card = document.createElement('div');
  card.className = 'feed-card';
  card.dataset.postId = docId;

  const myUid = currentUser?.uid;
  const likes = post.likes || [];
  const isLiked = likes.includes(myUid);
  const timeAgo = formatTimeAgo(post.createdAt?.toDate ? post.createdAt.toDate() : new Date());

  let avatarHtml;
  if (post.photoURL) {
    avatarHtml = `<img class="feed-avatar" src="${post.photoURL}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                  <div class="feed-avatar-initials" style="display:none">${getInitials(post.displayName)}</div>`;
  } else {
    avatarHtml = `<div class="feed-avatar-initials">${getInitials(post.displayName)}</div>`;
  }

  const chipsHtml = (post.chips || []).map(c =>
    `<span class="feed-chip ${c.color || ''}">${c.text}</span>`
  ).join('');

  const isUserPost = post.type === 'user_post';

  card.innerHTML = `
    <div class="feed-card-header">
      ${avatarHtml}
      <div class="feed-card-meta">
        <div class="feed-card-name">${escHtml(post.displayName || 'Ученик')}</div>
        <div class="feed-card-time">${timeAgo}</div>
      </div>
    </div>
    ${isUserPost ? `
      ${post.title ? `<div class="feed-user-text">${escHtml(post.title)}</div>` : ''}
      ${post.imageUrl ? `<div class="feed-card-image"><img src="${post.imageUrl}" alt="" loading="lazy" onclick="openFeedImage('${post.imageUrl}')"></div>` : ''}
    ` : `
      <div class="feed-card-body">
        <div class="feed-card-icon">${post.emoji || '📌'}</div>
        <div class="feed-card-text">
          <div class="feed-card-title">${escHtml(post.title || '')}</div>
          <div class="feed-card-sub">${escHtml(post.subtitle || '')}</div>
          ${chipsHtml ? `<div class="feed-card-chips">${chipsHtml}</div>` : ''}
        </div>
      </div>
    `}
    <div class="feed-card-footer">
      <button class="feed-like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${docId}')">
        <span class="like-heart">${isLiked ? '❤️' : '🤍'}</span>
        <span>${likes.length > 0 ? likes.length : ''}</span>
      </button>
      ${post.uid === myUid ? `<button class="feed-delete-btn" onclick="deletePost('${docId}')" title="Удалить пост">✕</button>` : ''}
    </div>`;
  return card;
}

function deletePost(docId) {
  if (!currentUser) return;
  db.collection('posts').doc(docId).get().then(doc => {
    if (!doc.exists || doc.data().uid !== currentUser.uid) return;
    db.collection('posts').doc(docId).delete();
  });
}

function toggleLike(docId) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const ref = db.collection('posts').doc(docId);
  ref.get().then(doc => {
    if (!doc.exists) return;
    const likes = doc.data().likes || [];
    const updated = likes.includes(uid)
      ? likes.filter(id => id !== uid)
      : [...likes, uid];
    ref.update({ likes: updated });
  });
}

async function createPost(type, data) {
  if (!currentUser) return;
  try {
    await db.collection('posts').add({
      uid: currentUser.uid,
      displayName: currentUser.displayName || 'Ученик',
      photoURL: currentUser.photoURL || null,
      type,
      ...buildPostContent(type, data),
      likes: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn('createPost error:', e);
  }
}

function buildPostContent(type, data) {
  switch (type) {
    case 'lesson_complete': {
      const stars = data.isPerfect ? '⭐⭐⭐' : data.hearts >= 2 ? '⭐⭐' : '⭐';
      return {
        emoji: '📖',
        title: 'Прошёл урок греческого',
        subtitle: `${stars} · ${data.correct}/${data.total} правильно`,
        chips: [
          { text: `+${data.xp} XP`, color: 'green' },
          { text: `🔥 ${data.streak} дн.`, color: 'yellow' }
        ]
      };
    }
    case 'quiz_complete': {
      const stars = data.pct === 1 ? '⭐⭐⭐' : data.pct >= 0.7 ? '⭐⭐' : '⭐';
      return {
        emoji: '🧩',
        title: `Квиз: ${data.categoryTitle || 'Греческий'}`,
        subtitle: `${stars} · ${data.score}/${data.total} правильно`,
        chips: [
          { text: `+${data.xp} XP`, color: 'green' },
          { text: `${Math.round(data.pct * 100)}%`, color: data.pct === 1 ? 'green' : 'blue' }
        ]
      };
    }
    case 'achievement': {
      return {
        emoji: data.icon || '🏆',
        title: `Достижение: ${data.title}`,
        subtitle: data.desc || '',
        chips: [{ text: 'Новое достижение', color: 'yellow' }]
      };
    }
    case 'streak': {
      return {
        emoji: '🔥',
        title: `${data.streak} дней подряд!`,
        subtitle: 'Отличная серия — так держать!',
        chips: [{ text: `🔥 ${data.streak} дней`, color: 'yellow' }]
      };
    }
    default:
      return { emoji: '📌', title: data.title || '', subtitle: '' };
  }
}

function formatTimeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openFeedImage(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:90vh;border-radius:12px;object-fit:contain">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', init);

// ============================================================
// NEWS FEED
// ============================================================
const NEWS_TOPICS = [
  { id: 'all',       label: 'Все',         emoji: '🌐' },
  { id: 'football',  label: 'Футбол',      emoji: '⚽', query: 'ποδόσφαιρο' },
  { id: 'politics',  label: 'Политика',    emoji: '🏛️', query: 'πολιτική' },
  { id: 'history',   label: 'История',     emoji: '📜', query: 'ιστορία' },
  { id: 'tech',      label: 'Технологии',  emoji: '💻', query: 'τεχνολογία' },
  { id: 'marketing', label: 'Маркетинг',   emoji: '📊', query: 'μάρκετινγκ' },
  { id: 'ai',        label: 'ИИ',          emoji: '🤖', query: 'τεχνητή νοημοσύνη' },
  { id: 'games',     label: 'Игры',        emoji: '🎮', query: 'βιντεοπαίχνια gaming' },
  { id: 'science',   label: 'Наука',       emoji: '🔬', query: 'επιστήμη' },
  { id: 'hollywood', label: 'Голливуд',    emoji: '🎬', query: 'χόλιγουντ κινηματογράφος' },
];

let newsCache = {};
let activeNewsTopic = 'all';
let newsRefreshTimer = null;
let translationCache = {};
let currentNewsItems = [];

async function showNews() {
  showScreen('screen-news');
  renderNewsTabs();
  await loadNews(activeNewsTopic);
  startNewsRefreshTimer();
}

function renderNewsTabs() {
  document.getElementById('news-tabs').innerHTML = NEWS_TOPICS.map(t => `
    <button class="news-tab ${t.id === activeNewsTopic ? 'active' : ''}" data-topic="${t.id}" onclick="switchNewsTopic('${t.id}')">
      ${t.emoji} ${t.label}
    </button>
  `).join('');
}

async function switchNewsTopic(topicId) {
  activeNewsTopic = topicId;
  document.querySelectorAll('.news-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.topic === topicId);
  });
  await loadNews(topicId);
}

async function loadNews(topicId, forceRefresh = false) {
  if (!forceRefresh && newsCache[topicId]) {
    currentNewsItems = newsCache[topicId];
    renderNewsItems(currentNewsItems, topicId);
    return;
  }
  showNewsLoading();
  try {
    const items = topicId === 'all'
      ? await fetchAllNews()
      : await fetchNewsForQuery(NEWS_TOPICS.find(t => t.id === topicId).query, topicId);
    newsCache[topicId] = items;
    currentNewsItems = items;
    renderNewsItems(items, topicId);
  } catch (e) {
    showNewsError();
  }
}

function fetchWithTimeout(url, ms) {
  return Promise.race([
    fetch(url, { cache: 'no-store' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function parseRSSXML(text) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const items = [...xml.querySelectorAll('item')];
  if (!items.length) return null;
  return items.map(item => {
    const rawTitle = item.querySelector('title')?.textContent || '';
    const linkNode = item.querySelector('link');
    const link = linkNode ? (linkNode.nextSibling?.nodeValue?.trim() || linkNode.textContent) : '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const source = item.querySelector('source')?.textContent || '';
    const desc = item.querySelector('description')?.textContent || '';
    const imgMatch = desc.match(/<img[^>]+src="([^"]+)"/);
    const thumbnail = imgMatch ? imgMatch[1] : '';
    return { title: rawTitle, link, pubDate, thumbnail, source };
  });
}

async function fetchRSS(rssUrl) {
  const encoded = encodeURIComponent(rssUrl);
  const proxies = [
    // rss2json — returns parsed JSON directly (no count param = free tier)
    async () => {
      const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encoded}`, 8000);
      const d = await res.json();
      if (d.status === 'ok' && d.items?.length) {
        return d.items.map(i => ({
          title: i.title, link: i.link, pubDate: i.pubDate,
          thumbnail: i.thumbnail || i.enclosure?.link || '', source: i.author || ''
        }));
      }
      return null;
    },
    // corsproxy.io — updated URL format
    async () => {
      const res = await fetchWithTimeout(`https://corsproxy.io/?url=${encoded}`, 8000);
      const text = await res.text();
      if (text.trim().startsWith('<')) return text;
      return null;
    },
    // allorigins raw endpoint
    async () => {
      const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encoded}`, 8000);
      if (!res.ok) return null;
      return await res.text();
    },
  ];

  for (const attempt of proxies) {
    try {
      const result = await attempt();
      if (!result) continue;
      // rss2json already returns parsed array
      if (Array.isArray(result)) return result;
      const parsed = parseRSSXML(result);
      if (parsed && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('RSS proxy failed, trying next:', e.message);
    }
  }
  return [];
}

async function fetchNewsForQuery(query, topicId) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=el&gl=GR&ceid=GR:el`;
  const items = await fetchRSS(rssUrl);
  return items.map(item => ({ ...item, _topicId: topicId }));
}

async function fetchAllNews() {
  const rssUrl = `https://news.google.com/rss?hl=el&gl=GR&ceid=GR:el`;
  return await fetchRSS(rssUrl);
}

function showNewsLoading() {
  document.getElementById('news-feed').innerHTML = `
    <div class="news-loading">
      <div class="news-spinner"></div>
      <div>Загружаем новости на греческом...</div>
    </div>`;
}

function showNewsError() {
  document.getElementById('news-feed').innerHTML = `
    <div class="news-error">
      ⚠️ Не удалось загрузить новости.<br>
      <button class="news-translate-btn" style="margin-top:12px" onclick="loadNews(activeNewsTopic, true)">
        Попробовать снова
      </button>
    </div>`;
}

function renderNewsItems(items, topicId) {
  const feed = document.getElementById('news-feed');
  if (!items || items.length === 0) {
    feed.innerHTML = `<div class="news-empty">Новостей не найдено 😕</div>`;
    return;
  }
  feed.innerHTML = items.map((item, idx) => {
    const imgUrl = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
    const imgHtml = imgUrl ? `<img class="news-img" src="${imgUrl}" alt="" onerror="this.style.display='none'" loading="lazy">` : '';
    const source = extractDomain(item.link || item.guid || '');
    const date = formatNewsDate(item.pubDate);
    const titleHtml = wrapWordsInSpans(item.title || '');
    const topic = NEWS_TOPICS.find(t => t.id === (item._topicId || topicId));
    const tagHtml = (topicId === 'all' && topic && topic.id !== 'all')
      ? `<div class="news-topic-tag">${topic.emoji} ${topic.label}</div>` : '';
    return `
      <div class="news-card">
        ${imgHtml}
        <div class="news-content">
          ${tagHtml}
          <div class="news-title">${titleHtml}</div>
          <div class="news-meta">
            <span class="news-source">${source}</span>
            <span class="news-date">${date}</span>
          </div>
          <button class="news-translate-btn" onclick="translateNewsItem(this, ${idx})">Перевести</button>
          <div class="news-translation" id="news-trans-${idx}" style="display:none"></div>
        </div>
      </div>`;
  }).join('');
}

function wrapWordsInSpans(text) {
  const clean = text.replace(/<[^>]*>/g, '');
  return clean.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    const word = token.replace(/^[«»"'.,!?;:()\[\]]+|[«»"'.,!?;:()\[\]]+$/g, '');
    if (!word || word.length < 2) return token;
    const safe = word.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return `<span class="news-word" onclick="translateWord(this,'${safe}')">${token}</span>`;
  }).join('');
}

function extractDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return ''; }
}

function formatNewsDate(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 60) return `${diff} мин. назад`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ч. назад`;
  return `${Math.floor(diff / 1440)} дн. назад`;
}

async function translateNewsItem(btn, idx) {
  const transEl = document.getElementById(`news-trans-${idx}`);
  if (transEl.style.display !== 'none') {
    transEl.style.display = 'none';
    btn.textContent = 'Перевести';
    btn.classList.remove('translated');
    return;
  }
  const text = currentNewsItems[idx] && currentNewsItems[idx].title;
  if (!text) return;
  btn.textContent = '...';
  btn.disabled = true;
  const translated = await fetchTranslation(text);
  transEl.textContent = translated;
  transEl.style.display = 'block';
  btn.textContent = 'Скрыть перевод';
  btn.classList.add('translated');
  btn.disabled = false;
}

async function translateWord(el, word) {
  if (!word || word.length < 2) return;
  document.querySelectorAll('.news-word.word-active').forEach(w => w.classList.remove('word-active'));
  el.classList.add('word-active');
  const tooltip = document.getElementById('word-tooltip');
  document.getElementById('word-tooltip-original').textContent = word;
  document.getElementById('word-tooltip-translation').textContent = '...';
  const rect = el.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.min(rect.left, window.innerWidth - 220);
  tooltip.style.cssText = `top:${top}px;left:${left}px;`;
  tooltip.classList.add('visible');
  const translation = await fetchTranslation(word);
  document.getElementById('word-tooltip-translation').textContent = translation;
  clearTimeout(tooltip._hideTimer);
  tooltip._hideTimer = setTimeout(() => {
    tooltip.classList.remove('visible');
    el.classList.remove('word-active');
  }, 4000);
}

async function fetchTranslation(text) {
  if (!text) return '';
  if (translationCache[text]) return translationCache[text];
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=el|ru`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data.responseData && data.responseData.translatedText
      ? data.responseData.translatedText
      : text;
    translationCache[text] = result;
    return result;
  } catch (e) { return '(ошибка перевода)'; }
}

function startNewsRefreshTimer() {
  if (newsRefreshTimer) clearInterval(newsRefreshTimer);
  newsRefreshTimer = setInterval(async () => {
    newsCache = {};
    const badge = document.getElementById('news-refresh-badge');
    if (badge) badge.classList.add('spinning');
    await loadNews(activeNewsTopic, true);
    if (badge) badge.classList.remove('spinning');
  }, 30 * 60 * 1000);
}

function manualRefreshNews() {
  newsCache = {};
  const badge = document.getElementById('news-refresh-badge');
  if (badge) badge.classList.add('spinning');
  loadNews(activeNewsTopic, true).then(() => {
    if (badge) badge.classList.remove('spinning');
  });
}

document.addEventListener('click', e => {
  if (!e.target.classList.contains('news-word')) {
    const tooltip = document.getElementById('word-tooltip');
    if (tooltip) tooltip.classList.remove('visible');
    document.querySelectorAll('.news-word.word-active').forEach(w => w.classList.remove('word-active'));
  }
  // Закрываем меню пользователя при клике вне
  const menu = document.getElementById('user-menu');
  const btn = document.getElementById('user-avatar-btn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ============================================================
// VOCAB QUIZ
// ============================================================
let currentVocabMode = 'image';
let vocabQuizState = {
  categoryId: null, mode: null, words: [],
  currentIndex: 0, score: 0, answered: false, totalWords: 10, options: []
};

function showVocab(mode) {
  currentVocabMode = mode;
  document.getElementById('vocab-screen-title').textContent = mode === 'image' ? 'Карточки' : 'Перевод';
  const descEl = document.getElementById('vocab-screen-desc');
  if (descEl) descEl.textContent = mode === 'image'
    ? 'Выбери картинку, которая соответствует греческому слову.'
    : 'Выбери правильный перевод греческого слова.';

  document.getElementById('vocab-categories-list').innerHTML =
    `<div class="vocab-categories-grid">${VOCAB_CATEGORIES.map(cat => {
      const learned = (state.vocabProgress[cat.id] || []).length;
      const total = cat.words.length;
      const pct = Math.round(learned / total * 100);
      const done = learned >= total;
      return `
      <div class="vocab-category-card${done ? ' vocab-cat-done' : ''}" onclick="startVocabQuiz('${cat.id}')">
        <div class="vocab-cat-icon">${done ? '✅' : cat.emoji}</div>
        <div class="vocab-cat-title">${cat.title}</div>
        ${learned > 0 ? `
        <div class="vocab-cat-progress">
          <div class="vocab-cat-progress-bar">
            <div class="vocab-cat-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="vocab-cat-progress-label">${learned}/${total}</span>
        </div>` : ''}
      </div>`;
    }).join('')}</div>`;

  // Reset search
  const si = document.getElementById('vocab-search');
  if (si) si.value = '';
  searchVocab('');

  showScreen('screen-vocab');
}

function searchVocab(query) {
  const q = query.trim().toLowerCase();
  const resultsEl = document.getElementById('vocab-search-results');
  const catsEl = document.getElementById('vocab-categories-list');

  if (!q) {
    resultsEl.style.display = 'none';
    catsEl.style.display = '';
    return;
  }

  catsEl.style.display = 'none';
  resultsEl.style.display = '';

  const matches = [];
  VOCAB_CATEGORIES.forEach(cat => {
    cat.words.forEach(w => {
      if (
        w.greek.toLowerCase().includes(q) ||
        w.transcription.toLowerCase().includes(q) ||
        w.translation.toLowerCase().includes(q)
      ) {
        matches.push({ ...w, catTitle: cat.title, catEmoji: cat.emoji });
      }
    });
  });

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="search-empty">Ничего не найдено</div>`;
    return;
  }

  resultsEl.innerHTML = `<div class="vocab-search-list">${matches.map(w => `
    <div class="vocab-search-card">
      <div class="vocab-search-emoji">${w.emoji || '📝'}</div>
      <div class="vocab-search-body">
        <div class="vocab-search-greek">${w.greek}
          <button class="vocab-tts-btn" data-greek="${w.greek.replace(/"/g,'&quot;')}"
                  onclick="speakGreek(this.dataset.greek)">🔊</button>
        </div>
        <div class="vocab-search-transcription">${w.transcription}</div>
        <div class="vocab-search-translation">${w.translation}</div>
      </div>
      <div class="vocab-search-cat">${w.catEmoji} ${w.catTitle}</div>
    </div>
  `).join('')}</div>`;
}

function startVocabQuiz(categoryId) {
  const category = VOCAB_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return;
  const words = shuffle([...category.words]).slice(0, 10);
  vocabQuizState = {
    categoryId, mode: currentVocabMode, words,
    currentIndex: 0, score: 0, answered: false, totalWords: words.length, options: []
  };
  showScreen('screen-vocab-quiz');
  renderVocabWord();
}

function renderVocabWord() {
  const { words, currentIndex, mode, totalWords } = vocabQuizState;
  const word = words[currentIndex];
  vocabQuizState.answered = false;
  document.getElementById('vocab-progress').style.width = (currentIndex / totalWords * 100) + '%';
  document.getElementById('vocab-score').textContent = vocabQuizState.score;
  document.getElementById('vocab-footer').style.display = 'none';
  document.getElementById('vocab-footer').className = 'lesson-footer';
  const category = VOCAB_CATEGORIES.find(c => c.id === vocabQuizState.categoryId);
  if (mode === 'image') renderImageQuiz(word, category);
  else renderTranslationQuiz(word, category);
}

function renderImageQuiz(word, category) {
  const pool = category.words.filter(w => w.greek !== word.greek);
  const wrongWords = shuffle(pool).slice(0, 3);
  // if pool has < 3 words pad from other categories
  if (wrongWords.length < 3) {
    const extra = VOCAB_CATEGORIES
      .filter(c => c.id !== category.id)
      .flatMap(c => c.words)
      .filter(w => !wrongWords.some(x => x.greek === w.greek));
    wrongWords.push(...shuffle(extra).slice(0, 3 - wrongWords.length));
  }
  const options = shuffle([word, ...wrongWords]);
  vocabQuizState.options = options;

  document.getElementById('vocab-quiz-container').innerHTML = `
    <div class="vocab-word-display">
      <div class="vocab-word-mode-label">✦ Новый</div>
      <div class="vocab-word-instruction">Выберите картинку с переводом на русский</div>
      <div class="vocab-word-greek">
        ${word.greek}
        <button class="vocab-tts-btn" data-greek="${word.greek.replace(/"/g, '&quot;')}" onclick="speakGreek(this.dataset.greek)">🔊</button>
      </div>
      <div class="vocab-word-transcription">${word.transcription}</div>
    </div>
    <div class="vocab-image-grid">
      ${options.map((opt, i) => `
        <button class="vocab-image-card" onclick="selectVocabAnswer(${i})">
          <span class="vocab-card-emoji">${opt.emoji}</span>
          <div class="vocab-card-label">${opt.translation}</div>
        </button>`).join('')}
    </div>`;
}

function renderTranslationQuiz(word, category) {
  const pool = category.words.filter(w => w.greek !== word.greek);
  const wrongWords = shuffle(pool).slice(0, 2);
  if (wrongWords.length < 2) {
    const extra = VOCAB_CATEGORIES
      .filter(c => c.id !== category.id)
      .flatMap(c => c.words)
      .filter(w => !wrongWords.some(x => x.greek === w.greek));
    wrongWords.push(...shuffle(extra).slice(0, 2 - wrongWords.length));
  }
  const options = shuffle([word, ...wrongWords]);
  vocabQuizState.options = options;

  document.getElementById('vocab-quiz-container').innerHTML = `
    <div class="vocab-word-display">
      <div class="vocab-word-mode-label">✦ Новый</div>
      <div class="vocab-word-instruction">Выберите перевод на русский</div>
      <div class="vocab-word-greek">
        ${word.greek}
        <button class="vocab-tts-btn" data-greek="${word.greek.replace(/"/g, '&quot;')}" onclick="speakGreek(this.dataset.greek)">🔊</button>
      </div>
      <div class="vocab-word-transcription">${word.transcription}</div>
    </div>
    <div class="vocab-translation-options">
      ${options.map((opt, i) => `
        <button class="vocab-translation-btn" onclick="selectVocabAnswer(${i})">
          ${opt.translation}
        </button>`).join('')}
    </div>`;
}

function selectVocabAnswer(optionIdx) {
  if (vocabQuizState.answered) return;
  vocabQuizState.answered = true;

  const { words, currentIndex, options, mode } = vocabQuizState;
  const correctWord = words[currentIndex];
  const selectedWord = options[optionIdx];
  const isCorrect = selectedWord.greek === correctWord.greek;
  const correctIdx = options.findIndex(o => o.greek === correctWord.greek);

  const btnSelector = mode === 'image' ? '.vocab-image-card' : '.vocab-translation-btn';
  const buttons = document.querySelectorAll(btnSelector);
  buttons.forEach(btn => btn.disabled = true);

  if (isCorrect) {
    vocabQuizState.score++;
    buttons[optionIdx].classList.add('correct');
    document.getElementById('vocab-score').textContent = vocabQuizState.score;
    document.getElementById('vocab-feedback').textContent = randomCorrectPhrase();
    document.getElementById('vocab-feedback').className = 'feedback-message correct';
    document.getElementById('vocab-footer').className = 'lesson-footer correct-footer';
    playSound('correct');
    // Mark word as learned
    const catId = vocabQuizState.categoryId;
    if (!state.vocabProgress[catId]) state.vocabProgress[catId] = [];
    if (!state.vocabProgress[catId].includes(correctWord.greek)) {
      state.vocabProgress[catId].push(correctWord.greek);
    }
  } else {
    buttons[optionIdx].classList.add('wrong');
    buttons[correctIdx].classList.add('correct');
    document.getElementById('vocab-feedback').innerHTML = `Правильно: <strong>${correctWord.translation}</strong> ${correctWord.emoji}`;
    document.getElementById('vocab-feedback').className = 'feedback-message wrong';
    document.getElementById('vocab-footer').className = 'lesson-footer wrong-footer';
    playSound('wrong');
  }
  document.getElementById('vocab-footer').style.display = 'flex';
}

function nextVocabWord() {
  vocabQuizState.currentIndex++;
  if (vocabQuizState.currentIndex >= vocabQuizState.totalWords) completeVocabQuiz();
  else renderVocabWord();
}

function completeVocabQuiz() {
  const { score, totalWords } = vocabQuizState;
  const xp = score * XP_PER_CORRECT;
  state.totalXp += xp;
  state.dailyXp += xp;
  state.level = Math.floor(state.totalXp / 500) + 1;
  const today = new Date().toDateString();
  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak = (state.lastPlayed === yesterday.toDateString()) ? state.streak + 1 : 1;
    state.lastPlayed = today;
  }
  saveState();
  checkAchievements({});
  const pct = score / totalWords;
  document.getElementById('vocab-complete-stars').textContent = pct === 1 ? '⭐⭐⭐' : pct >= 0.7 ? '⭐⭐' : '⭐';
  document.getElementById('vocab-complete-score').textContent = `${score}/${totalWords}`;
  document.getElementById('vocab-complete-xp').textContent = `+${xp}`;
  showScreen('screen-vocab-complete');
}

function restartVocabQuiz() { startVocabQuiz(vocabQuizState.categoryId); }
function exitVocabQuiz() { showVocab(currentVocabMode); }


// ============================================================
// QUIZ — SENTENCE ORDERING
// ============================================================
let quizState = {
  categoryId: null, sentences: [], currentIndex: 0,
  hearts: 3, score: 0, xpEarned: 0, answered: false,
  placedWords: [], availableWords: [], dragSrc: null
};

function showQuiz() {
  const list = document.getElementById('quiz-categories-list');
  list.innerHTML = `<div class="vocab-categories-grid">${
    QUIZ_CATEGORIES.map(cat => `
      <div class="vocab-category-card" onclick="startQuiz('${cat.id}')">
        <div class="vocab-cat-icon">${cat.emoji}</div>
        <div class="vocab-cat-title">${cat.title}</div>
        <div class="vocab-cat-count">${cat.sentences.length} предложений</div>
      </div>`).join('')
  }</div>`;
  showScreen('screen-quiz');
}

function startQuiz(categoryId) {
  const cat = QUIZ_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return;
  // Берём 10 предложений: сортируем по сложности, выбираем равномерно
  const sorted = [...cat.sentences].sort((a, b) => a.diff - b.diff);
  const sentences = shuffle(sorted).slice(0, 10).sort((a, b) => a.diff - b.diff);
  quizState = {
    categoryId, sentences, currentIndex: 0,
    hearts: 3, score: 0, xpEarned: 0, answered: false,
    placedWords: [], availableWords: [], dragSrc: null
  };
  showScreen('screen-quiz-session');
  renderQuizSentence();
}

function renderQuizSentence() {
  const { sentences, currentIndex } = quizState;
  const s = sentences[currentIndex];
  quizState.answered = false;
  quizState.placedWords = [];
  quizState.availableWords = shuffle([...s.words]);

  document.getElementById('quiz-progress').style.width =
    (currentIndex / quizState.sentences.length * 100) + '%';
  document.getElementById('quiz-xp').textContent = quizState.xpEarned;
  document.getElementById('quiz-footer').style.display = 'none';
  document.getElementById('quiz-footer').className = 'lesson-footer';

  renderQuizUI(s);
}

function renderQuizUI(s) {
  const container = document.getElementById('quiz-session-container');
  const hearts = '<span class="heart-icon">❤️</span>'.repeat(quizState.hearts) +
    '<span class="heart-icon dead">🖤</span>'.repeat(3 - quizState.hearts);

  container.innerHTML = `
    <div class="quiz-hearts">${hearts}</div>
    <div class="quiz-translation">${s.ru}</div>
    <div class="quiz-answer-area" id="quiz-answer-area">
      ${quizState.placedWords.length === 0
        ? '<span class="quiz-answer-placeholder">Нажми на слова ниже</span>'
        : quizState.placedWords.map((w, i) =>
            `<button class="quiz-word-tile placed" onclick="removeQuizWord(${i})"
              draggable="true" data-idx="${i}" data-source="placed">${w}</button>`
          ).join('')}
    </div>
    <div class="quiz-word-pool" id="quiz-word-pool">
      ${quizState.availableWords.map((w, i) =>
        `<button class="quiz-word-tile" onclick="addQuizWord(${i})"
          draggable="true" data-idx="${i}" data-source="pool">${w}</button>`
      ).join('')}
    </div>
    <button class="btn-primary quiz-check-btn" id="quiz-check-btn"
      onclick="checkQuizAnswer()"
      ${quizState.placedWords.length === 0 ? 'disabled' : ''}>
      Проверить ✓
    </button>`;

  setupQuizDragDrop();
}

function addQuizWord(poolIdx) {
  if (quizState.answered) return;
  const word = quizState.availableWords[poolIdx];
  quizState.availableWords.splice(poolIdx, 1);
  quizState.placedWords.push(word);
  renderQuizUI(quizState.sentences[quizState.currentIndex]);
}

function removeQuizWord(placedIdx) {
  if (quizState.answered) return;
  const word = quizState.placedWords[placedIdx];
  quizState.placedWords.splice(placedIdx, 1);
  quizState.availableWords.push(word);
  renderQuizUI(quizState.sentences[quizState.currentIndex]);
}

function checkQuizAnswer() {
  if (quizState.answered || quizState.placedWords.length === 0) return;
  const s = quizState.sentences[quizState.currentIndex];

  // Проверяем если все слова размещены
  if (quizState.placedWords.length < s.words.length) return;

  quizState.answered = true;
  const correct = s.words.join(' ');
  const answer = quizState.placedWords.join(' ');
  const isCorrect = answer === correct;

  const footer = document.getElementById('quiz-footer');
  const feedback = document.getElementById('quiz-feedback');
  const checkBtn = document.getElementById('quiz-check-btn');
  if (checkBtn) checkBtn.disabled = true;

  // Подсветка ответа
  const answerArea = document.getElementById('quiz-answer-area');
  if (answerArea) {
    answerArea.classList.add(isCorrect ? 'answer-correct' : 'answer-wrong');
  }

  if (isCorrect) {
    quizState.score++;
    quizState.xpEarned += XP_PER_CORRECT;
    document.getElementById('quiz-xp').textContent = quizState.xpEarned;
    feedback.textContent = randomCorrectPhrase();
    feedback.className = 'feedback-message correct';
    footer.className = 'lesson-footer correct-footer';
    playSound('correct');
  } else {
    quizState.hearts--;
    feedback.innerHTML = `Правильно: <strong>${correct}</strong>`;
    feedback.className = 'feedback-message wrong';
    footer.className = 'lesson-footer wrong-footer';
    playSound('wrong');
  }

  footer.style.display = 'flex';
  const continueBtn = document.getElementById('quiz-continue-btn');
  continueBtn.textContent = quizState.hearts <= 0 ? 'Завершить' : 'Продолжить';
}

function nextQuizSentence() {
  if (quizState.hearts <= 0) { completeQuiz(); return; }
  quizState.currentIndex++;
  if (quizState.currentIndex >= quizState.sentences.length) completeQuiz();
  else renderQuizSentence();
}

function completeQuiz() {
  const { score, xpEarned } = quizState;
  const total = quizState.sentences.length;
  state.totalXp += xpEarned;
  state.dailyXp += xpEarned;
  state.level = Math.floor(state.totalXp / 500) + 1;
  const today = new Date().toDateString();
  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak = (state.lastPlayed === yesterday.toDateString()) ? state.streak + 1 : 1;
    state.lastPlayed = today;
  }
  saveState();

  const pct = score / total;
  const cat = QUIZ_CATEGORIES.find(c => c.id === quizState.categoryId);
  createPost('quiz_complete', {
    score, total, pct, xp: xpEarned,
    categoryTitle: cat?.title || 'Греческий'
  });

  document.getElementById('quiz-complete-stars').textContent =
    pct === 1 ? '⭐⭐⭐' : pct >= 0.7 ? '⭐⭐' : '⭐';
  document.getElementById('quiz-complete-score').textContent = `${score}/${total}`;
  document.getElementById('quiz-complete-xp').textContent = `+${xpEarned}`;
  showScreen('screen-quiz-complete');
}

function restartQuiz() { startQuiz(quizState.categoryId); }
function exitQuiz() { showQuiz(); }

// ============================================================
// DRAG AND DROP
// ============================================================
function setupQuizDragDrop() {
  const tiles = document.querySelectorAll('.quiz-word-tile');
  const answerArea = document.getElementById('quiz-answer-area');
  const pool = document.getElementById('quiz-word-pool');

  tiles.forEach(tile => {
    // Desktop drag
    tile.addEventListener('dragstart', e => {
      quizState.dragSrc = tile;
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));

    // Mobile touch drag
    tile.addEventListener('touchstart', handleTouchStart, { passive: true });
    tile.addEventListener('touchmove', handleTouchMove, { passive: false });
    tile.addEventListener('touchend', handleTouchEnd);
  });

  [answerArea, pool].forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      if (!quizState.dragSrc) return;
      const src = quizState.dragSrc.dataset.source;
      const idx = parseInt(quizState.dragSrc.dataset.idx);
      const dest = zone.id === 'quiz-answer-area' ? 'placed' : 'pool';
      if (src === 'pool' && dest === 'placed') addQuizWord(idx);
      else if (src === 'placed' && dest === 'pool') removeQuizWord(idx);
    });
  });
}

let _touchTile = null, _touchClone = null, _touchOffX = 0, _touchOffY = 0;

function handleTouchStart(e) {
  _touchTile = e.currentTarget;
  const t = e.touches[0];
  const r = _touchTile.getBoundingClientRect();
  _touchOffX = t.clientX - r.left;
  _touchOffY = t.clientY - r.top;
  _touchClone = _touchTile.cloneNode(true);
  _touchClone.className = 'quiz-word-tile dragging touch-clone';
  _touchClone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;
    left:${r.left}px;top:${r.top}px;width:${r.width}px;opacity:0.85;`;
  document.body.appendChild(_touchClone);
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!_touchClone) return;
  const t = e.touches[0];
  _touchClone.style.left = (t.clientX - _touchOffX) + 'px';
  _touchClone.style.top = (t.clientY - _touchOffY) + 'px';
}

function handleTouchEnd(e) {
  if (!_touchClone || !_touchTile) return;
  const t = e.changedTouches[0];
  _touchClone.remove();

  const el = document.elementFromPoint(t.clientX, t.clientY);
  const inAnswer = el && (el.id === 'quiz-answer-area' || el.closest('#quiz-answer-area'));
  const inPool = el && (el.id === 'quiz-word-pool' || el.closest('#quiz-word-pool'));

  const src = _touchTile.dataset.source;
  const idx = parseInt(_touchTile.dataset.idx);

  if (src === 'pool' && inAnswer) addQuizWord(idx);
  else if (src === 'placed' && inPool) removeQuizWord(idx);

  _touchTile = null;
  _touchClone = null;
}

// ============================================================
// BLOG
// ============================================================
const BLOG_ARTICLES = [
  {
    section: '📚 С чего начать',
    color: 'green',
    items: [
      { slug: 'grecheskiy-alfavit',               emoji: '🔤', tag: 'Основы',     title: 'Греческий алфавит за 1 час: таблица с русской транскрипцией' },
      { slug: 'kak-govorit-po-grecheski',          emoji: '📚', tag: 'С нуля',     title: 'Как научиться говорить по-гречески с нуля: пошаговый план' },
      { slug: 'grecheskiy-za-30-dney',             emoji: '📅', tag: 'Челлендж',   title: 'Греческий за 30 дней: реальный план с нуля до первого разговора' },
      { slug: 'intervalnoe-povtorenie-grecheskiy', emoji: '🧠', tag: 'Методика',   title: 'Интервальное повторение: как запоминать греческие слова навсегда' },
      { slug: 'grecheskiye-slova-kotoryye-ty-znaesh', emoji: '💡', tag: 'Мотивация', title: 'Греческие слова которые ты уже знаешь — и не подозревал' },
      { slug: 'grecheskiye-filmy-seriali',         emoji: '🎬', tag: 'Погружение', title: 'Греческие фильмы и сериалы для изучения языка: топ рекомендации' },
    ]
  },
  {
    section: '🇨🇾 Жизнь на Кипре',
    color: 'green',
    items: [
      { slug: 'grecheskiy-na-kipre',          emoji: '🇨🇾', tag: 'Гид',       title: 'Как выучить греческий на Кипре: реальный опыт русскоязычных' },
      { slug: 'grecheskiy-frazy-dlya-kipra',  emoji: '💬', tag: 'Фразы',     title: '50 греческих фраз для жизни на Кипре: банк, ΚΕΠ, аптека, ресторан' },
      { slug: 'grecheskiy-u-vracha',          emoji: '🏥', tag: 'Срочное',   title: 'Греческий у врача: ГЕСЙ, скорая помощь и аптека' },
      { slug: 'arenda-kvartiry-kipre',        emoji: '🏠', tag: 'Быт',       title: 'Аренда квартиры на Кипре по-гречески: от звонка до договора' },
      { slug: 'nalog-kommunalnyye-kipre',     emoji: '📋', tag: 'Документы', title: 'Налоговая и коммунальные услуги на Кипре по-гречески' },
      { slug: 'dorozhnyye-znaki-grecheskiy',  emoji: '🚗', tag: 'Транспорт', title: 'Дорожные знаки на Кипре и греческий для водителей' },
      { slug: 'grecheskiy-na-rabote',         emoji: '💼', tag: 'Карьера',   title: 'Греческий на работе: фразы для офиса и собеседования' },
      { slug: 'grecheskiy-dlya-detey',        emoji: '👨‍👩‍👧', tag: 'Семья',    title: 'Греческий для детей на Кипре: как помочь ребёнку освоить язык' },
    ]
  },
  {
    section: '📖 Грамматика и словарь',
    color: 'green',
    items: [
      { slug: 'grecheskaya-grammatika-dlya-nachinayuschikh', emoji: '📖', tag: 'Грамматика', title: 'Греческая грамматика для русских: что общего и в чём отличия' },
      { slug: 'proshedshee-vremya-grecheskiy',               emoji: '⏳', tag: 'Грамматика', title: 'Прошедшее время в греческом: простое объяснение для начинающих' },
      { slug: 'voprositelnyye-slova-grecheskiy',             emoji: '❓', tag: 'Грамматика', title: 'Вопросительные слова в греческом: как задать любой вопрос' },
      { slug: 'grecheskiye-prilagatelnye',                   emoji: '✨', tag: 'Словарь',    title: 'Топ-50 греческих прилагательных с примерами и транскрипцией' },
      { slug: 'grecheskiye-glagoly',                         emoji: '⚡', tag: 'Словарь',    title: '50 самых нужных греческих глаголов с примерами' },
      { slug: 'grecheskiy-chislitelnyye',                    emoji: '🔢', tag: 'Словарь',    title: 'Числа на греческом: от 1 до 1000 с произношением' },
      { slug: 'lozhnye-druzya-grecheskiy',                   emoji: '🪤', tag: 'Ошибки',     title: 'Ложные друзья: греческие слова которые обманывают русских' },
    ]
  },
  {
    section: '🎭 Культура и жизнь',
    color: 'green',
    items: [
      { slug: 'kiprskoye-narechiye',         emoji: '🗣️', tag: 'Диалект',    title: 'Кипрский диалект vs стандартный греческий: главные отличия' },
      { slug: 'grecheskiye-prazdniki-frazy', emoji: '🎉', tag: 'Культура',   title: 'Греческие праздники и традиции: что говорить и как себя вести' },
      { slug: 'grecheskaya-kukhnya-slovar',  emoji: '🍽️', tag: 'Кухня',      title: 'Греческая кухня: словарь для ресторана и рынка λαϊκή' },
      { slug: 'grecheskiye-zhesty',          emoji: '🤙', tag: 'Культура',   title: 'Греческие жесты и язык тела: что значит кивок вверх' },
      { slug: 'grecheskiye-poslovitsy',      emoji: '📜', tag: 'Культура',   title: 'Греческие пословицы с переводом: мудрость тысячелетий' },
      { slug: 'grecheskiy-sleng',            emoji: '😎', tag: 'Разговорный', title: 'Греческий сленг и неформальная речь: как говорят греки на самом деле' },
    ]
  },
  {
    section: '🧠 Техники и психология',
    color: 'purple',
    items: [
      { slug: 'metod-kato-lomb',                           emoji: '📗', tag: 'Методика',   title: 'Метод Като Ломб: как выучить язык читая книги' },
      { slug: 'tehnika-shadowing',                         emoji: '🎙️', tag: 'Методика',   title: 'Техника shadowing: повторяй за носителем и заговоришь быстрее' },
      { slug: 'metod-krashena-comprehensible-input',       emoji: '🌊', tag: 'Наука',      title: 'Метод Крашена: comprehensible input — самый естественный способ учить язык' },
      { slug: 'strakh-oshibok-pri-izuchenii-yazyka',       emoji: '💪', tag: 'Психология', title: 'Страх ошибок при изучении языка: как перестать бояться говорить' },
      { slug: '10-minut-v-den-effektivnost',               emoji: '⏱️', tag: 'Наука',      title: '10 минут в день vs 2 часа в неделю: что работает лучше' },
      { slug: 'kak-sozdat-privychku-uchit-yazyk',          emoji: '🔄', tag: 'Психология', title: 'Как создать привычку учить язык: нейронаука и практика' },
      { slug: 'metod-pareto-80-20-yazyk',                  emoji: '📊', tag: 'Стратегия',  title: 'Метод 80/20 в изучении языка: что учить в первую очередь' },
      { slug: 'poligloty-mira-kak-uchat-yazyki',           emoji: '🌍', tag: 'Полиглоты',  title: 'Полиглоты мира: как Бенни Льюис, Като Ломб и другие учат языки' },
      { slug: 'metod-pogruzheniya-bez-poyezdki',           emoji: '🏠', tag: 'Immersion',  title: 'Метод погружения в язык без поездки за рубеж: полный гид' },
      { slug: 'sindrom-samozvantsa-pri-izuchenii-yazyka',  emoji: '🦸', tag: 'Психология', title: 'Синдром самозванца при изучении языка: ты лучше чем думаешь' },
    ]
  },
];

function showBlog() {
  showScreen('screen-blog');
  renderBlogList();
}

function renderBlogList() {
  const container = document.getElementById('blog-list');
  if (!container) return;

  let html = '';
  BLOG_ARTICLES.forEach(section => {
    const isPurple = section.color === 'purple';
    html += `<div class="blog-section-label${isPurple ? ' blog-section-purple' : ''}">${section.section}</div>`;
    html += `<div class="blog-section-grid">`;
    section.items.forEach(article => {
      const safeTitle = article.title.replace(/"/g, '&quot;');
      html += `
        <button class="blog-card" data-slug="${article.slug}" data-title="${safeTitle}" onclick="openBlogArticle(this.dataset.slug, this.dataset.title)">
          <div class="blog-card-emoji${isPurple ? ' blog-card-emoji-purple' : ''}">${article.emoji}</div>
          <div class="blog-card-body">
            <div class="blog-card-tag${isPurple ? ' blog-card-tag-purple' : ''}">${article.tag}</div>
            <div class="blog-card-title">${article.title}</div>
          </div>
          <div class="blog-card-arrow${isPurple ? ' blog-card-arrow-purple' : ''}">→</div>
        </button>`;
    });
    html += `</div>`;
  });

  container.innerHTML = html;
}

function openBlogArticle(slug, title) {
  const frame = document.getElementById('blog-article-frame');
  const titleEl = document.getElementById('blog-article-title');
  if (frame) frame.src = `https://izigreek.com/blog/${slug}.html`;
  if (titleEl) titleEl.textContent = title;
  showScreen('screen-blog-article');
}

// ============================================================
// SPEECH TRAINING
// ============================================================
const SPEECH_CATEGORIES = (() => {
  const cats = [];

  // Глаголы из VERBS
  cats.push({
    id: 'verbs',
    icon: '📚',
    name: 'Глаголы',
    getWords: () => VERBS.map(v => ({
      greek: v.infinitive,
      transcription: v.transcription,
      translation: v.translation
    }))
  });

  // Фразы из PHRASES
  if (typeof PHRASES !== 'undefined') {
    PHRASES.forEach(cat => {
      cats.push({
        id: 'phrase_' + cat.id,
        icon: cat.icon || '💬',
        name: 'Фразы: ' + cat.category,
        getWords: () => cat.phrases.map(p => ({
          greek: p.greek,
          transcription: p.transcription,
          translation: p.translation
        }))
      });
    });
  }

  // Словарь из VOCAB_CATEGORIES
  if (typeof VOCAB_CATEGORIES !== 'undefined') {
    VOCAB_CATEGORIES.forEach(cat => {
      cats.push({
        id: 'vocab_' + cat.id,
        icon: cat.icon || '🔤',
        name: cat.title,
        getWords: () => cat.words.map(w => ({
          greek: w.greek,
          transcription: w.transcription,
          translation: w.translation
        }))
      });
    });
  }

  return cats;
})();

let speechSession = {
  words: [],
  index: 0,
  total: 15,
  correctCount: 0,
  xpEarned: 0,
  recognition: null,
  uiState: 'idle', // idle | recording | correct | wrong
  micGranted: false // разрешение на микрофон получено один раз
};

function requestMicPermissionOnce() {
  if (speechSession.micGranted) return; // уже есть — не спрашиваем

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    // На мобиле проверяем через Permissions API без вызова getUserMedia
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' }).then(result => {
        if (result.state === 'granted') speechSession.micGranted = true;
      }).catch(() => {});
    }
    return;
  }

  // На десктопе — запрашиваем один раз при входе в раздел
  navigator.mediaDevices && navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      stream.getTracks().forEach(t => t.stop());
      speechSession.micGranted = true;
    })
    .catch(() => {}); // пользователь отказал — спросим при нажатии кнопки
}

function showSpeechTraining() {
  requestMicPermissionOnce();
  const list = document.getElementById('speech-categories-list');
  list.innerHTML = '';
  SPEECH_CATEGORIES.forEach(cat => {
    const count = cat.getWords().length;
    const btn = document.createElement('button');
    btn.className = 'speech-cat-btn';
    btn.innerHTML = `
      <div class="speech-cat-icon">${cat.icon}</div>
      <div class="speech-cat-info">
        <div class="speech-cat-name">${cat.name}</div>
        <div class="speech-cat-count">${count} слов / фраз</div>
      </div>
      <div class="speech-cat-arrow">›</div>`;
    btn.onclick = () => startSpeechSession(cat.id);
    list.appendChild(btn);
  });
  showScreen('screen-speech-categories');
}

function startSpeechSession(catId) {
  const cat = SPEECH_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  const all = cat.getWords().filter(w => w.greek && w.translation);
  const shuffled = all.sort(() => Math.random() - 0.5);
  speechSession.words = shuffled.slice(0, speechSession.total);
  speechSession.index = 0;
  speechSession.correctCount = 0;
  speechSession.xpEarned = 0;
  speechSession.uiState = 'idle';
  renderSpeechCard();
  showScreen('screen-speech');
}

function renderSpeechCard() {
  const w = speechSession.words[speechSession.index];
  document.getElementById('speech-greek').textContent = w.greek;
  document.getElementById('speech-transcription').textContent = w.transcription || '';
  document.getElementById('speech-translation').textContent = w.translation ? '"' + w.translation + '"' : '';
  document.getElementById('speech-counter').textContent =
    (speechSession.index + 1) + '/' + speechSession.total;
  const pct = (speechSession.index / speechSession.total) * 100;
  document.getElementById('speech-progress').style.width = pct + '%';
  document.getElementById('speech-recognized').textContent = '';
  setSpeechUIState('idle');
}

function setSpeechUIState(st) {
  speechSession.uiState = st;
  const btn    = document.getElementById('speech-mic-btn');
  const bubble = document.getElementById('speech-bubble');
  const badge  = document.getElementById('speech-bubble-badge');
  const word   = document.getElementById('speech-greek');
  const char   = document.getElementById('speech-character');

  btn.className = 'speech-mic-btn';

  if (st === 'idle') {
    btn.classList.add('speech-mic-idle');
    btn.innerHTML = '<span style="font-size:28px">🎤</span>';
    bubble.textContent = 'Скажите это слово:';
    badge.style.display = 'none';
    word.className = 'speech-greek-word';
    char.className = 'speech-character';
  } else if (st === 'recording') {
    btn.classList.add('speech-mic-recording');
    btn.innerHTML = '<div class="speech-waves"><span></span><span></span><span></span><span></span><span></span></div>';
    bubble.textContent = 'Слушаю...';
    badge.style.display = 'none';
    word.className = 'speech-greek-word';
  } else if (st === 'correct') {
    btn.classList.add('speech-mic-correct');
    btn.innerHTML = '<span style="font-size:32px">✓</span>';
    bubble.textContent = 'Отлично! Продолжаем!';
    badge.style.display = 'none';
    word.className = 'speech-greek-word speech-correct';
    char.className = 'speech-character speech-character-happy';
  } else if (st === 'wrong') {
    btn.classList.add('speech-mic-idle');
    btn.innerHTML = '<span style="font-size:28px">🎤</span>';
    bubble.textContent = 'Скажите это слово:';
    badge.style.display = 'flex';
    word.className = 'speech-greek-word speech-wrong';
    char.className = 'speech-character speech-character-thinking';
  }
}

function onSpeechMicClick() {
  if (speechSession.uiState === 'recording') return;

  if (speechSession.uiState === 'correct') {
    speechSession.index++;
    if (speechSession.index >= speechSession.total) {
      finishSpeechSession();
    } else {
      renderSpeechCard();
    }
    return;
  }

  startSpeechRecognition();
}

function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Ваш браузер не поддерживает распознавание речи. Используйте Chrome или Safari.');
    return;
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (speechSession.micGranted || isMobile) {
    // Разрешение уже есть (или мобиль) — запускаем сразу
    runSpeechRecognition(SR);
  } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // Первый раз на десктопе — запрашиваем разрешение
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop());
        speechSession.micGranted = true;
        runSpeechRecognition(SR);
      })
      .catch(err => {
        setSpeechUIState('idle');
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          alert('Нужен доступ к микрофону. Разреши его в настройках браузера и попробуй снова.');
        }
      });
  } else {
    runSpeechRecognition(SR);
  }
}

function runSpeechRecognition(SR) {
  setSpeechUIState('recording');
  const r = new SR();
  r.lang = 'el-GR';
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 6;
  speechSession.recognition = r;

  // Таймаут — если за 9 секунд ничего не распознано, останавливаем
  const timeout = setTimeout(() => {
    if (speechSession.uiState === 'recording') {
      try { r.stop(); } catch(e) {}
    }
  }, 9000);

  r.onspeechend = () => {
    // Речь закончилась — принудительно останавливаем, чтобы получить результат
    try { r.stop(); } catch(e) {}
  };

  r.onresult = (event) => {
    clearTimeout(timeout);
    const target = speechSession.words[speechSession.index].greek;
    const alts = Array.from(event.results[0]).map(a => a.transcript);
    document.getElementById('speech-recognized').textContent = alts[0] || '';
    const ok = alts.some(t => normalizeGreekSpeech(t) === normalizeGreekSpeech(target));
    if (ok) {
      speechSession.correctCount++;
      speechSession.xpEarned += 5;
      setSpeechUIState('correct');
    } else {
      setSpeechUIState('wrong');
    }
  };

  r.onerror = (e) => {
    clearTimeout(timeout);
    if (e.error === 'not-allowed') {
      alert('Нужен доступ к микрофону. Разреши его в настройках браузера и попробуй снова.');
    }
    if (e.error !== 'aborted') setSpeechUIState('idle');
  };

  r.onend = () => {
    clearTimeout(timeout);
    if (speechSession.uiState === 'recording') setSpeechUIState('idle');
    speechSession.recognition = null;
  };

  r.start();
}

function normalizeGreekSpeech(text) {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0345]/g, '')
    .replace(/[^α-ωa-z]/gi, '')
    .trim();
}

function finishSpeechSession() {
  // Award XP
  const xp = speechSession.xpEarned + 10; // +10 bonus for finishing
  state.totalXp += xp;
  state.dailyXp = (state.dailyXp || 0) + xp;
  state.level = Math.floor(state.totalXp / 500) + 1;
  state.lessonsCompleted = (state.lessonsCompleted || 0) + 1;
  const today = new Date().toDateString();
  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak = (state.lastPlayed === yesterday.toDateString()) ? state.streak + 1 : 1;
    state.lastPlayed = today;
  }
  saveState();
  checkAchievements({});

  document.getElementById('speech-complete-correct').textContent = speechSession.correctCount;
  document.getElementById('speech-complete-xp').textContent = '+' + xp;
  document.getElementById('speech-complete-total').textContent = speechSession.total;
  showScreen('screen-speech-complete');
}

function exitSpeechTraining() {
  if (speechSession.recognition) {
    try { speechSession.recognition.abort(); } catch(e) {}
    speechSession.recognition = null;
  }
  showSpeechTraining();
}

// ============================================================
// TEACH PHASE — карточки перед уроком
// ============================================================
function startTeachPhase(mod) {
  teachState = { module: mod, cards: mod.verbs, currentCard: 0 };
  renderTeachCard();
  showScreen('screen-teach');
}

function renderTeachCard() {
  const { cards, currentCard, module } = teachState;
  const total = cards.length;
  const pct = (currentCard / total) * 100;
  document.getElementById('teach-progress').style.width = pct + '%';
  document.getElementById('teach-counter').textContent = `${Math.min(currentCard + 1, total)}/${total}`;

  if (currentCard >= total) {
    document.getElementById('teach-label').textContent = 'Готово — ты изучил все слова!';
    document.getElementById('teach-card-area').innerHTML = `
      <div class="teach-summary-card">
        <div class="teach-summary-icon">🎯</div>
        <div class="teach-summary-title">Урок ${module.id} · Слова изучены</div>
        <div class="teach-summary-words">${cards.map(v =>
          `<span class="teach-summary-word">${v.infinitive} — ${v.translation}</span>`
        ).join('')}</div>
        <div class="teach-summary-hint">Теперь проверим, как ты запомнил</div>
      </div>`;
    const btn = document.getElementById('teach-next-btn');
    btn.textContent = 'Начать упражнения ▶';
    btn.onclick = finishTeachPhase;
    return;
  }

  const verb = cards[currentCard];
  document.getElementById('teach-label').textContent = `Урок ${module.id} · Слово ${currentCard + 1} из ${total}`;
  document.getElementById('teach-card-area').innerHTML = `
    <div class="teach-greek-row">
      <div class="teach-greek-word">${verb.infinitive}</div>
      <button class="teach-speak-btn" onclick="speakGreek('${verb.infinitive.replace(/'/g, "\\'")}')">🔊</button>
    </div>
    ${verb.transcription ? `<div class="teach-transcription">${verb.transcription}</div>` : ''}
    <div class="teach-translation">${verb.translation}</div>
    ${verb.note ? `<div class="teach-note">${verb.note}</div>` : ''}
    ${verb.example ? `
    <div class="teach-example-box">
      <div class="teach-example-label">Пример:</div>
      <button class="teach-example-speak" onclick="speakGreek('${verb.example.greek.replace(/'/g, "\\'")}')">🔊</button>
      <div class="teach-example-greek">${verb.example.greek}</div>
      <div class="teach-example-ru">${verb.example.ru}</div>
    </div>` : ''}
    <details class="teach-conj-details">
      <summary class="teach-conj-summary">Спряжение ▾</summary>
      <div class="teach-conj-grid">
        ${Object.entries(verb.present || {}).map(([pr, form]) =>
          `<span class="teach-conj-pr">${pr}</span><span class="teach-conj-form" onclick="speakGreek('${form}')">${form}</span>`
        ).join('')}
      </div>
    </details>`;

  const btn = document.getElementById('teach-next-btn');
  btn.textContent = currentCard < total - 1 ? 'Следующее слово →' : 'Последнее! →';
  btn.onclick = nextTeachCard;
}

function nextTeachCard() {
  teachState.currentCard++;
  renderTeachCard();
}

function finishTeachPhase() {
  const mod = teachState.module;
  lessonState = {
    exercises: generateLesson(mod.verbs),
    currentIndex: 0, hearts: 3, xpEarned: 0, correct: 0,
    answered: false, isWeakMode: false, isSrsMode: false
  };
  showScreen('screen-lesson');
  renderExercise();
}

// ============================================================
// EXAM PREP — подготовка к экзамену
// ============================================================
function showExamPrep() {
  showScreen('screen-exam');
}

function showExamSection(section) {
  if (section === 'tests')     { startExamMockTest(); return; }
  if (section === 'listening') { startExamListening(); return; }
  const map = {
    structure: ['🗺️ Как устроен экзамен', getExamStructureHTML],
    writing:   ['✍️ Письмо',              getExamWritingHTML],
    speaking:  ['🗣️ Говорение',           getExamSpeakingHTML],
    grammar:   ['📚 Грамматика A2/B1',    getExamGrammarHTML],
    tips:      ['💡 Лайфхаки',            getExamTipsHTML],
    vocab:      ['📖 Экзаменационный словарь', getExamVocabHTML],
    listening:  ['🎧 Аудирование',            null],
  };
  const [title, fn] = map[section] || map.tips;
  document.getElementById('exam-detail-title').textContent = title;
  document.getElementById('exam-detail-body').innerHTML = fn();
  showScreen('screen-exam-detail');
}

function getExamStructureHTML() {
  return `
<div class="exam-info-banner">
  <div class="exam-info-row"><span>📍 Организатор</span><strong>Кипрский университет (UCY) + Минобр</strong></div>
  <div class="exam-info-row"><span>💶 Стоимость</span><strong>€90</strong></div>
  <div class="exam-info-row"><span>📅 Сессии</span><strong>Январь · Май · Сентябрь</strong></div>
  <div class="exam-info-row"><span>🎯 Для гражданства</span><strong>A2 (5 лет) · B1 (4 года)</strong></div>
</div>

<div class="exam-part-card">
  <div class="exam-part-header">
    <span class="exam-part-num">1</span>
    <div><div class="exam-part-title">🎧 Аудирование</div><div class="exam-part-time">~20 минут · 25 баллов</div></div>
  </div>
  <div class="exam-part-desc">3–4 коротких диалога — слушаешь и отвечаешь на вопросы.</div>
  <div class="exam-part-label">Типы заданий:</div>
  <ul class="exam-part-list">
    <li>Верно / Неверно / Не упоминается</li>
    <li>Выбор из 3 вариантов (A/B/C)</li>
    <li>Записать ключевое слово или цифру</li>
  </ul>
  <div class="exam-part-example">
    <b>Примеры ситуаций:</b> таксист и пассажир · звонок в ресторан · диалог в магазине · объявление по радио
  </div>
</div>

<div class="exam-part-card">
  <div class="exam-part-header">
    <span class="exam-part-num">2</span>
    <div><div class="exam-part-title">📖 Чтение</div><div class="exam-part-time">~30 минут · 25 баллов</div></div>
  </div>
  <div class="exam-part-desc">2–3 текста (объявления, письма, статьи) — читаешь и отвечаешь.</div>
  <div class="exam-part-label">Типы заданий:</div>
  <ul class="exam-part-list">
    <li>Верно / Неверно по тексту</li>
    <li>Вставить слово из списка в пропуск</li>
    <li>Соединить части предложений</li>
    <li>Ответить на вопросы по тексту</li>
  </ul>
  <div class="exam-part-example">
    <b>Примеры тем:</b> объявление о мероприятии · письмо от друга · расписание · меню · реклама
  </div>
</div>

<div class="exam-part-card">
  <div class="exam-part-header">
    <span class="exam-part-num">3</span>
    <div><div class="exam-part-title">✍️ Письмо</div><div class="exam-part-time">~45 минут · 25 баллов</div></div>
  </div>
  <div class="exam-part-desc"><strong>2 текста по 80–100 слов каждый.</strong> Артикли и предлоги считаются как слова.</div>
  <div class="exam-part-label">Задание 1 — Письмо другу (неформальное):</div>
  <ul class="exam-part-list">
    <li>Рассказать о событии, поездке, покупке</li>
    <li>Описать свой день / выходные / праздник</li>
    <li>Пригласить на встречу</li>
  </ul>
  <div class="exam-part-label" style="margin-top:8px">Задание 2 — Официальный текст:</div>
  <ul class="exam-part-list">
    <li>Заявление (в школу, муниципалитет)</li>
    <li>Запрос информации (о курсах, событии)</li>
    <li>Объявление (продаю / ищу / предлагаю)</li>
  </ul>
  <div class="exam-part-example">💡 Структура важнее словарного запаса. Выучи шаблоны — и этот блок станет самым лёгким.</div>
</div>

<div class="exam-part-card">
  <div class="exam-part-header">
    <span class="exam-part-num">4</span>
    <div><div class="exam-part-title">🗣️ Говорение</div><div class="exam-part-time">~15 минут · 25 баллов</div></div>
  </div>
  <div class="exam-part-desc">Разговор с экзаменатором и с другим участником. 3 этапа:</div>
  <ul class="exam-part-list">
    <li><strong>Представление себя</strong> — кто ты, семья, работа, Кипр</li>
    <li><strong>Описание картинки</strong> — что видишь, что происходит</li>
    <li><strong>Диалог с партнёром</strong> — вместе решаете ситуацию</li>
  </ul>
  <div class="exam-part-example">💡 Говори медленно. Простое правильное предложение лучше сложного с ошибками. Не знаешь слово — опиши его другими словами.</div>
</div>

<div class="exam-scoring-block">
  <div class="exam-scoring-title">⚖️ Проходной балл</div>
  <div class="exam-scoring-row"><span>Каждая часть</span><span>макс. 25 баллов</span></div>
  <div class="exam-scoring-row"><span>Итого максимум</span><span>100 баллов</span></div>
  <div class="exam-scoring-row exam-scoring-pass"><span>Минимум для сдачи</span><span>60 баллов</span></div>
  <div class="exam-scoring-note">Можно слабо написать одну часть и компенсировать другими.</div>
</div>`;
}

function sp(text) {
  return `onclick="speakGreek('${text.replace(/'/g,"\\'")}')"`;
}

function getExamSpeakingHTML() {
  return `
<div class="speaking-intro">
  Говорение — <strong>3 этапа</strong>, ~15 минут. Оценивают правильность, словарный запас и уверенность. Говори медленно — это плюс, не минус.
</div>

<div class="speaking-stage-header">Этап 1 · Представление себя</div>
<div class="speaking-stage-hint">Экзаменатор задаёт вопросы о тебе. Знай ответы наизусть.</div>

${[
  ['Πώς σας λένε;','Как вас зовут?','Με λένε Όλγα Ιβάνοβα.','Меня зовут Ольга Иванова.'],
  ['Από πού είστε;','Откуда вы?','Είμαι από τη Ρωσία, από τη Μόσχα.','Я из России, из Москвы.'],
  ['Πόσο καιρό μένετε στην Κύπρο;','Сколько времени живёте на Кипре?','Μένω στην Κύπρο εδώ και τέσσερα χρόνια.','Живу на Кипре уже четыре года.'],
  ['Τι δουλειά κάνετε;','Кем вы работаете?','Είμαι λογίστρια και δουλεύω σε μια εταιρεία.','Я бухгалтер и работаю в компании.'],
  ['Έχετε οικογένεια;','У вас есть семья?','Ναι, είμαι παντρεμένη και έχω δύο παιδιά.','Да, я замужем и у меня двое детей.'],
  ['Γιατί μαθαίνετε ελληνικά;','Почему учите греческий?','Μαθαίνω ελληνικά για να πάρω την κυπριακή υπηκοότητα και να επικοινωνώ με τους γείτονες.','Учу греческий чтобы получить кипрское гражданство и общаться с соседями.'],
].map(([q,qru,a,aru]) => `
  <div class="speaking-qa-card">
    <div class="speaking-q-row">
      <div class="speaking-q">${q}</div>
      <button class="speaking-tts-btn" ${sp(q)}>🔊</button>
    </div>
    <div class="speaking-qru">${qru}</div>
    <div class="speaking-a-row">
      <div class="speaking-a">${a}</div>
      <button class="speaking-tts-btn" ${sp(a)}>🔊</button>
    </div>
    <div class="speaking-aru">${aru}</div>
  </div>`).join('')}

<div class="speaking-stage-header">Этап 2 · Описание картинки</div>
<div class="speaking-stage-hint">Дают фото — нужно описать что видишь. Используй эти фразы:</div>

<div class="speaking-phrases-card">
${[
  ['Στη φωτογραφία βλέπω...','На фотографии я вижу...'],
  ['Στο κέντρο της εικόνας υπάρχει...','В центре картинки есть...'],
  ['Στο βάθος βλέπω...','На заднем плане я вижу...'],
  ['Νομίζω ότι είναι...','Думаю, что это...'],
  ['Φαίνεται ότι οι άνθρωποι...','Похоже, что люди...'],
  ['Ο καιρός φαίνεται...','Погода, кажется,...'],
  ['Μου αρέσει αυτή η φωτογραφία γιατί...','Мне нравится эта фотография, потому что...'],
].map(([gr,ru]) => `
  <div class="speaking-phrase-row">
    <div class="speaking-phrase-left">
      <div class="speaking-phrase-gr">${gr}</div>
      <div class="speaking-phrase-ru">${ru}</div>
    </div>
    <button class="speaking-tts-btn" ${sp(gr)}>🔊</button>
  </div>`).join('')}
</div>

<div class="speaking-stage-header">Этап 3 · Диалог с партнёром</div>
<div class="speaking-stage-hint">Вместе с другим участником решаете ситуацию. Типичные темы:</div>

${[
  ['🍽️ Выбрать ресторан',['Πού θα πάμε για φαγητό;','Τι προτιμάς — ψάρι ή κρέας;','Πόσο κοστίζει περίπου;','Τι ώρα θα συναντηθούμε;']],
  ['✈️ Спланировать поездку',['Πού θέλεις να πας;','Πότε είσαι ελεύθερος/η;','Πόσες μέρες θα μείνουμε;','Με τι θα πάμε — αεροπλάνο ή πλοίο;']],
  ['🎉 Организовать праздник',['Πότε κάνουμε το πάρτι;','Ποιους θα καλέσουμε;','Τι φαγητό θα φέρουμε;','Ποιος φέρνει τη μουσική;']],
  ['🛒 Купить подержанную вещь',['Σε τι κατάσταση είναι;','Πόσο καιρό το έχετε;','Μπορείτε να κατεβάσετε λίγο την τιμή;','Πότε μπορούμε να το παραλάβουμε;']],
].map(([title, phrases]) => `
  <details class="speaking-topic-card">
    <summary>${title}</summary>
    <div class="speaking-topic-phrases">
      ${phrases.map(p => `
        <div class="speaking-topic-phrase-row">
          <span>${p}</span>
          <button class="speaking-tts-btn" ${sp(p)}>🔊</button>
        </div>`).join('')}
    </div>
  </details>`).join('')}

<div class="speaking-tip-block">
  💡 <strong>Если не знаешь слово</strong> — скажи <em onclick="${sp('Πώς λέγεται στα ελληνικά;')}" style="cursor:pointer;color:#9B59B6">«Πώς λέγεται στα ελληνικά;»</em> (Как это по-гречески?) или опиши его другими словами. Экзаменаторы это ценят.
</div>`;
}

function getExamWritingHTML() {
  return `
<div class="writing-intro">
  На экзамене нужно написать <strong>2 текста по 80–100 слов</strong> за 45 минут.<br>
  Выучи эти шаблоны — и письмо станет самой лёгкой частью.
</div>

<!-- ===== ПИСЬМО ДРУГУ ===== -->
<div class="writing-type-header">📩 Тип 1 — Письмо другу (неформальное)</div>

<div class="writing-template-card">
  <div class="writing-template-title">Универсальный шаблон</div>
  <div class="writing-block writing-block-open">
    <div class="writing-block-label">Обращение</div>
    <div class="writing-greek">Αγαπητή μου Μαρία, / Γεια σου Νίκο!</div>
    <div class="writing-ru">Дорогая Мария, / Привет Никос!</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Начало — как дела</div>
    <div class="writing-greek">Πώς είσαι; Ελπίζω να είσαι καλά.</div>
    <div class="writing-ru">Как ты? Надеюсь, у тебя всё хорошо.</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Основная часть (меняется по теме)</div>
    <div class="writing-greek">Σου γράφω γιατί θέλω να σου πω για...</div>
    <div class="writing-ru">Пишу тебе, потому что хочу рассказать о...</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Вопрос в конце</div>
    <div class="writing-greek">Εσύ τι κάνεις; Πώς περνάς;</div>
    <div class="writing-ru">А ты как? Как проводишь время?</div>
  </div>
  <div class="writing-block writing-block-close">
    <div class="writing-block-label">Закрытие</div>
    <div class="writing-greek">Τα λέμε σύντομα! Φιλιά πολλά,<br><em>Όλγα</em></div>
    <div class="writing-ru">Увидимся скоро! Много поцелуев, Ольга</div>
  </div>
</div>

<div class="writing-topics-label">📋 Темы которые дают на экзамене + что писать:</div>

<details class="writing-topic">
  <summary>🛍️ Поход в торговый центр</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Την Κυριακή πήγα στο εμπορικό κέντρο με την οικογένειά μου. Αγόρασα ένα ζευγάρι παπούτσια και ένα φόρεμα. Τα ρούχα ήταν πολύ φθηνά γιατί είχε εκπτώσεις. Μετά φάγαμε σε ένα εστιατόριο στον τρίτο όροφο. Ήταν πολύ νόστιμο!</div>
    <div class="writing-ru">В воскресенье я ходила в торговый центр с семьёй. Купила пару обуви и платье. Одежда была очень дешёвой, потому что были скидки. Потом поели в ресторане на третьем этаже. Было очень вкусно!</div>
  </div>
</details>

<details class="writing-topic">
  <summary>🎂 День рождения / праздник</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Χθες ήταν τα γενέθλιά μου και έκανα ένα μικρό πάρτι στο σπίτι. Ήρθαν οι φίλοι μου και η οικογένειά μου. Φάγαμε, χορέψαμε και γελάσαμε πολύ. Έλαβα πολλά δώρα! Ήταν μια υπέροχη βραδιά που δεν θα ξεχάσω ποτέ.</div>
    <div class="writing-ru">Вчера был мой день рождения и я устроила небольшую вечеринку дома. Пришли мои друзья и семья. Мы ели, танцевали и много смеялись. Я получила много подарков! Это был прекрасный вечер, который я никогда не забуду.</div>
  </div>
</details>

<details class="writing-topic">
  <summary>🏖️ Поездка / отпуск</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Τον Αύγουστο πήγα διακοπές στην Ελλάδα με τον άντρα μου. Μείναμε σε ένα ξενοδοχείο κοντά στη θάλασσα. Κάθε μέρα κολυμπούσαμε και επισκεπτόμασταν αρχαία μνημεία. Ο καιρός ήταν υπέροχος. Θέλω να ξαναπάω του χρόνου!</div>
    <div class="writing-ru">В августе я ездила в отпуск в Грецию с мужем. Мы жили в отеле рядом с морем. Каждый день купались и посещали древние памятники. Погода была прекрасной. Хочу поехать снова в следующем году!</div>
  </div>
</details>

<details class="writing-topic">
  <summary>📅 Приглашение на встречу</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Θέλω να σε προσκαλέσω στο σπίτι μου το Σάββατο στις 7 το βράδυ. Θα κάνουμε ένα μικρό τραπέζι με φίλους. Θα υπάρχει φαγητό, μουσική και πολλή διασκέδαση! Μπορείς να έρθεις; Απάντησέ μου σύντομα.</div>
    <div class="writing-ru">Хочу пригласить тебя к себе в субботу в 7 вечера. Мы устраиваем небольшой ужин с друзьями. Будет еда, музыка и много веселья! Сможешь прийти? Ответь мне скоро.</div>
  </div>
</details>

<!-- ===== ОФИЦИАЛЬНОЕ ПИСЬМО ===== -->
<div class="writing-type-header" style="margin-top:8px">🏛️ Тип 2 — Официальное письмо / заявление</div>

<div class="writing-template-card">
  <div class="writing-template-title">Универсальный шаблон</div>
  <div class="writing-block writing-block-open">
    <div class="writing-block-label">Кому (адресат)</div>
    <div class="writing-greek">Προς τη Διεύθυνση / Κύριε Διευθυντή,</div>
    <div class="writing-ru">В адрес Дирекции / Господин директор,</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Тема</div>
    <div class="writing-greek">Θέμα: Αίτηση για πληροφορίες / εγγραφή</div>
    <div class="writing-ru">Тема: Запрос информации / заявление о записи</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Представление себя</div>
    <div class="writing-greek">Ονομάζομαι [όνομα] και μένω στη Λεμεσό εδώ και τρία χρόνια.</div>
    <div class="writing-ru">Меня зовут [имя] и я живу в Лимасоле уже три года.</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Цель письма</div>
    <div class="writing-greek">Σας γράφω γιατί θα ήθελα να μάθω / να εγγραφώ / να ζητήσω...</div>
    <div class="writing-ru">Пишу вам, потому что хотел(а) бы узнать / записаться / попросить...</div>
  </div>
  <div class="writing-block">
    <div class="writing-block-label">Вопрос / просьба</div>
    <div class="writing-greek">Θα ήθελα να μάθω: Ποιες είναι οι ώρες; Πόσο κοστίζει; Πότε αρχίζει;</div>
    <div class="writing-ru">Хотел(а) бы узнать: Какое расписание? Сколько стоит? Когда начинается?</div>
  </div>
  <div class="writing-block writing-block-close">
    <div class="writing-block-label">Закрытие</div>
    <div class="writing-greek">Σας ευχαριστώ εκ των προτέρων.<br>Με εκτίμηση,<br><em>[Όνομα Επώνυμο]</em></div>
    <div class="writing-ru">Заранее благодарю вас.<br>С уважением,<br><em>[Имя Фамилия]</em></div>
  </div>
</div>

<details class="writing-topic">
  <summary>📚 Запрос о курсах греческого</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Σας γράφω γιατί ενδιαφέρομαι να παρακολουθήσω μαθήματα ελληνικής γλώσσας στο κέντρο σας. Θα ήθελα να μάθω: πότε αρχίζουν τα μαθήματα, πόσες φορές την εβδομάδα γίνονται, πόσο κοστίζει η εγγραφή και αν υπάρχουν μαθήματα για επίπεδο Α2.</div>
    <div class="writing-ru">Пишу вам, потому что хочу посещать курсы греческого языка в вашем центре. Хотел(а) бы узнать: когда начинаются занятия, сколько раз в неделю они проходят, сколько стоит запись и есть ли занятия для уровня A2.</div>
  </div>
</details>

<details class="writing-topic">
  <summary>📢 Объявление (продаю / ищу)</summary>
  <div class="writing-topic-body">
    <div class="writing-greek">Πωλείται καναπές σε καλή κατάσταση. Χρώμα: γκρι. Διαστάσεις: 2 μέτρα. Τιμή: 150 ευρώ, διαπραγματεύσιμη. Λόγος πώλησης: μετακόμιση. Για πληροφορίες τηλεφωνήστε στο 99-123456. Παράδοση δυνατή.</div>
    <div class="writing-ru">Продаётся диван в хорошем состоянии. Цвет: серый. Размер: 2 метра. Цена: 150 евро, возможен торг. Причина продажи: переезд. Для информации звоните: 99-123456. Возможна доставка.</div>
  </div>
</details>

<div class="writing-phrases-block">
  <div class="writing-phrases-title">🔑 Ключевые фразы — выучи наизусть</div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Σου γράφω γιατί...</span><span class="writing-phrase-ru">Пишу тебе, потому что...</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Θέλω να σου πω ότι...</span><span class="writing-phrase-ru">Хочу сказать тебе, что...</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Ήταν πολύ ωραία!</span><span class="writing-phrase-ru">Было очень хорошо!</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Χάρηκα πολύ που...</span><span class="writing-phrase-ru">Я очень обрадовалась, что...</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Ανυπομονώ να σε δω!</span><span class="writing-phrase-ru">Не могу дождаться встречи с тобой!</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Σε ευχαριστώ για το γράμμα σου.</span><span class="writing-phrase-ru">Спасибо за твоё письмо.</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Θα ήθελα να μάθω...</span><span class="writing-phrase-ru">Хотел(а) бы узнать...</span></div>
  <div class="writing-phrase-row"><span class="writing-phrase-gr">Σας ευχαριστώ εκ των προτέρων.</span><span class="writing-phrase-ru">Заранее благодарю вас.</span></div>
</div>`;
}

function getExamGrammarHTML() {
  return `
<div class="gram-nav">Нажми на тему:</div>
<div class="gram-toc">
  <button class="gram-toc-btn" onclick="document.getElementById('gr1').scrollIntoView({behavior:'smooth'})">Настоящее</button>
  <button class="gram-toc-btn" onclick="document.getElementById('gr2').scrollIntoView({behavior:'smooth'})">Прошедшее</button>
  <button class="gram-toc-btn" onclick="document.getElementById('gr3').scrollIntoView({behavior:'smooth'})">Будущее</button>
  <button class="gram-toc-btn" onclick="document.getElementById('gr4').scrollIntoView({behavior:'smooth'})">Артикли</button>
  <button class="gram-toc-btn" onclick="document.getElementById('gr5').scrollIntoView({behavior:'smooth'})">Предлоги</button>
  <button class="gram-toc-btn" onclick="document.getElementById('gr6').scrollIntoView({behavior:'smooth'})">Конструкции</button>
</div>

<div id="gr1" class="gram-block">
  <div class="gram-title">🔵 Настоящее время</div>
  <div class="gram-subtitle">A-спряжение (-ω): κάνω, έχω, θέλω, βλέπω, ξέρω, πηγαίνω</div>
  <table class="gram-table">
    <tr><td>εγώ</td><td>κάν<b>ω</b></td><td>έχ<b>ω</b></td></tr>
    <tr><td>εσύ</td><td>κάν<b>εις</b></td><td>έχ<b>εις</b></td></tr>
    <tr><td>αυτός/ή</td><td>κάν<b>ει</b></td><td>έχ<b>ει</b></td></tr>
    <tr><td>εμείς</td><td>κάν<b>ουμε</b></td><td>έχ<b>ουμε</b></td></tr>
    <tr><td>εσείς</td><td>κάν<b>ετε</b></td><td>έχ<b>ετε</b></td></tr>
    <tr><td>αυτοί</td><td>κάν<b>ουν</b></td><td>έχ<b>ουν</b></td></tr>
  </table>
  <div class="gram-subtitle" style="margin-top:10px">B-спряжение (-ώ/-άω): μιλώ, αγαπώ, περνώ, ρωτώ</div>
  <table class="gram-table">
    <tr><td>εγώ</td><td>μιλ<b>ώ</b></td><td>εσύ</td><td>μιλ<b>άς</b></td></tr>
    <tr><td>αυτός/ή</td><td>μιλ<b>ά</b></td><td>εμείς</td><td>μιλ<b>άμε</b></td></tr>
    <tr><td>εσείς</td><td>μιλ<b>άτε</b></td><td>αυτοί</td><td>μιλ<b>άνε</b></td></tr>
  </table>
  <div class="gram-subtitle" style="margin-top:10px">Неправильные — учи отдельно</div>
  <table class="gram-table">
    <tr><td>είμαι</td><td>είμαι / είσαι / είναι / είμαστε / είστε / είναι</td></tr>
    <tr><td>λέω</td><td>λέω / λες / λέει / λέμε / λέτε / λένε</td></tr>
  </table>
</div>

<div id="gr2" class="gram-block">
  <div class="gram-title">🟠 Прошедшее время (αόριστος)</div>
  <div class="gram-tip">💡 Самое важное для письма и говорения — рассказываешь о том, что уже произошло.</div>
  <div class="gram-subtitle" style="margin-top:8px">Правило для A-глаголов: убери -ω, добавь -α/-ες/-ε/-αμε/-ατε/-αν</div>
  <table class="gram-table">
    <tr><th>Сейчас</th><th>В прошлом</th><th>Перевод</th></tr>
    <tr><td>κάνω</td><td>έ<b>καν</b>α</td><td>я сделал(а)</td></tr>
    <tr><td>αγοράζω</td><td>αγόρ<b>ασ</b>α</td><td>я купил(а)</td></tr>
    <tr><td>μιλώ</td><td>μίλ<b>ησ</b>α</td><td>я поговорил(а)</td></tr>
    <tr><td>περνώ</td><td>πέρ<b>ασ</b>α</td><td>я провёл(а) время</td></tr>
    <tr><td>τρώω</td><td>έφαγα</td><td>я поел(а)</td></tr>
  </table>
  <div class="gram-subtitle" style="margin-top:10px">Неправильные прошедшие — выучи наизусть</div>
  <table class="gram-table">
    <tr><th>Глагол</th><th>εγώ</th><th>αυτός/ή</th></tr>
    <tr><td>πηγαίνω (идти)</td><td><b>πήγα</b></td><td>πήγε</td></tr>
    <tr><td>έχω (иметь)</td><td><b>είχα</b></td><td>είχε</td></tr>
    <tr><td>είμαι (быть)</td><td><b>ήμουν</b></td><td>ήταν</td></tr>
    <tr><td>λέω (говорить)</td><td><b>είπα</b></td><td>είπε</td></tr>
    <tr><td>βλέπω (видеть)</td><td><b>είδα</b></td><td>είδε</td></tr>
    <tr><td>έρχομαι (приходить)</td><td><b>ήρθα</b></td><td>ήρθε</td></tr>
    <tr><td>παίρνω (брать)</td><td><b>πήρα</b></td><td>πήρε</td></tr>
  </table>
  <div class="gram-example-sent">
    <div>Χθες <b>πήγα</b> στο σούπερ μάρκετ. — Вчера я ходил(а) в супермаркет.</div>
    <div>Το Σαββατοκύριακο <b>είδα</b> τους φίλους μου. — На выходных я видел(а) друзей.</div>
    <div>Η βραδιά <b>ήταν</b> πολύ ωραία! — Вечер был очень приятный!</div>
  </div>
</div>

<div id="gr3" class="gram-block">
  <div class="gram-title">🟢 Будущее время</div>
  <div class="gram-rule"><b>θα</b> + форма глагола (как настоящее, но с θα)</div>
  <table class="gram-table">
    <tr><th>Настоящее</th><th>Будущее</th><th>Перевод</th></tr>
    <tr><td>πηγαίνω</td><td><b>θα πάω</b></td><td>я пойду / поеду</td></tr>
    <tr><td>κάνω</td><td><b>θα κάνω</b></td><td>я сделаю</td></tr>
    <tr><td>αγοράζω</td><td><b>θα αγοράσω</b></td><td>я куплю</td></tr>
    <tr><td>μιλώ</td><td><b>θα μιλήσω</b></td><td>я поговорю</td></tr>
    <tr><td>έρχομαι</td><td><b>θα έρθω</b></td><td>я приду</td></tr>
  </table>
  <div class="gram-example-sent">
    <div>Αύριο <b>θα πάω</b> στη δουλειά. — Завтра я пойду на работу.</div>
    <div>Το καλοκαίρι <b>θα ταξιδέψουμε</b> στην Ελλάδα. — Летом мы поедем в Грецию.</div>
  </div>
  <div class="gram-tip">💡 θα + δεν = δεν θα: Δεν θα πάω — я не пойду</div>
</div>

<div id="gr4" class="gram-block">
  <div class="gram-title">🔷 Артикли и падежи</div>
  <div class="gram-subtitle">Именительный (кто? что?) — субъект предложения</div>
  <table class="gram-table">
    <tr><th></th><th>м.р.</th><th>ж.р.</th><th>ср.р.</th></tr>
    <tr><td>определённый</td><td><b>ο</b> φίλος</td><td><b>η</b> φίλη</td><td><b>το</b> παιδί</td></tr>
    <tr><td>неопределённый</td><td><b>ένας</b> φίλος</td><td><b>μια</b> φίλη</td><td><b>ένα</b> παιδί</td></tr>
  </table>
  <div class="gram-subtitle" style="margin-top:10px">Винительный (кого? что?) — объект действия</div>
  <table class="gram-table">
    <tr><th></th><th>м.р.</th><th>ж.р.</th><th>ср.р.</th></tr>
    <tr><td>определённый</td><td><b>τον</b> φίλο</td><td><b>την</b> φίλη</td><td><b>το</b> παιδί</td></tr>
    <tr><td>неопределённый</td><td><b>έναν</b> φίλο</td><td><b>μια</b> φίλη</td><td><b>ένα</b> παιδί</td></tr>
  </table>
  <div class="gram-example-sent">
    <div><b>Ο</b> φίλος μου μένει στη Λεμεσό. — Мой друг живёт в Лимасоле.</div>
    <div>Βλέπω <b>τον</b> φίλο μου κάθε μέρα. — Я вижу своего друга каждый день.</div>
  </div>
  <div class="gram-tip">💡 Среднего рода артикль <b>το</b> не меняется никогда.</div>
</div>

<div id="gr5" class="gram-block">
  <div class="gram-title">🟡 Предлоги + артикли (слияние)</div>
  <div class="gram-subtitle">σε + τον/την/το → στον / στην / στο</div>
  <table class="gram-table">
    <tr><th>Предлог</th><th>Значение</th><th>Пример</th></tr>
    <tr><td><b>στο / στη / στον</b></td><td>в, на, к</td><td>στο σπίτι — дома, στην Κύπρο — на Кипре</td></tr>
    <tr><td><b>από</b></td><td>из, от, с</td><td>από την Ελλάδα — из Греции</td></tr>
    <tr><td><b>με</b></td><td>с (вместе)</td><td>με τον άντρα μου — с мужем</td></tr>
    <tr><td><b>για</b></td><td>для, о, про</td><td>για τη δουλειά — о работе</td></tr>
    <tr><td><b>μετά</b></td><td>после, потом</td><td>μετά το φαγητό — после еды</td></tr>
    <tr><td><b>πριν</b></td><td>до, перед</td><td>πριν από δύο χρόνια — два года назад</td></tr>
  </table>
</div>

<div id="gr6" class="gram-block">
  <div class="gram-title">🟣 Ключевые конструкции A2</div>
  <table class="gram-table">
    <tr><th>Конструкция</th><th>Пример</th><th>Перевод</th></tr>
    <tr><td><b>θέλω να</b> + гл.</td><td>Θέλω να πάω σπίτι.</td><td>Хочу пойти домой.</td></tr>
    <tr><td><b>μπορώ να</b> + гл.</td><td>Μπορώ να σε βοηθήσω;</td><td>Могу тебе помочь?</td></tr>
    <tr><td><b>πρέπει να</b> + гл.</td><td>Πρέπει να μελετώ.</td><td>Нужно учиться.</td></tr>
    <tr><td><b>δεν</b> + гл.</td><td>Δεν καταλαβαίνω.</td><td>Я не понимаю.</td></tr>
    <tr><td><b>γιατί</b> / <b>επειδή</b></td><td>Πήγα γιατί ήθελα...</td><td>Пошёл(а), потому что...</td></tr>
    <tr><td><b>όταν</b></td><td>Όταν ήμουν μικρή...</td><td>Когда я была маленькой...</td></tr>
  </table>
  <div class="gram-tip">💡 μπορώ να + θέλω να + πρέπει να — три конструкции которые покрывают 70% разговорных ситуаций на экзамене.</div>
</div>`;
}

function getExamTipsHTML() {
  return `
<div class="tips-intro">Практические советы от тех, кто уже сдал экзамен на гражданство.</div>
<div class="tip-item">
  <div class="tip-num">1</div>
  <div class="tip-body">
    <div class="tip-title">Структура экзамена A2/B1</div>
    <div class="tip-text">4 части: аудирование (слушать и отвечать), чтение (понять текст), письмо (написать письмо/описание), говорение (диалог с экзаменатором). Каждая часть оценивается отдельно.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">2</div>
  <div class="tip-body">
    <div class="tip-title">Уровень для гражданства</div>
    <div class="tip-text">Для гражданства Греции/Кипра нужен B1. Если знаешь A2 — пробуй B1, экзаменаторы ценят старание. Сертификат признаётся при 6+ годах проживания.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">3</div>
  <div class="tip-body">
    <div class="tip-title">Приоритет: спряжение εγώ/εσύ/αυτός</div>
    <div class="tip-text">90% разговора — три лица: я, ты, он/она. Выучи спряжение 30 ключевых глаголов для этих лиц — и ты уже можешь строить предложения.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">4</div>
  <div class="tip-body">
    <div class="tip-title">θέλω να + глагол — твоё главное оружие</div>
    <div class="tip-text">«Я хочу [что-то сделать]» — эта конструкция работает в магазине, банке, у врача, в КЕП. Выучи θέλω να + базовые глаголы и ты можешь попросить что угодно.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">5</div>
  <div class="tip-body">
    <div class="tip-title">Аудирование: слушай фоново</div>
    <div class="tip-text">Включай греческое радио (ERT) или новости фоном дома. Не пытайся всё понять — просто привыкай к ритму языка. 30 минут в день = +20% на аудировании через месяц.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">6</div>
  <div class="tip-body">
    <div class="tip-title">Письмо: 3 шаблона покрывают всё</div>
    <div class="tip-text">Выучи 3 шаблона письма: 1) представление себя и семьи, 2) описание своего дня/распорядка, 3) что тебе нравится/не нравится в Греции/Кипре. Экзаменаторы дают именно эти темы.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">7</div>
  <div class="tip-body">
    <div class="tip-title">Говорение: медленно и уверенно</div>
    <div class="tip-text">Говори медленно — экзаменатор ставит очки за правильность, не за скорость. Простое предложение, сказанное без ошибок, лучше сложного с запинками.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">8</div>
  <div class="tip-body">
    <div class="tip-title">Чтение: смотри на контекст, не на каждое слово</div>
    <div class="tip-text">Не нужно понимать каждое слово. Читай абзац целиком — контекст обычно даёт понимание общего смысла. Вопросы всегда о главной идее, а не о деталях.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">9</div>
  <div class="tip-body">
    <div class="tip-title">Минимальный словарный запас A2</div>
    <div class="tip-text">~600-800 слов. Приоритет: числа, дни/месяцы, семья, еда, работа, здоровье, транспорт, магазины. Все эти темы есть в разделе «Карточки» этого приложения.</div>
  </div>
</div>
<div class="tip-item">
  <div class="tip-num">10</div>
  <div class="tip-body">
    <div class="tip-title">За месяц до экзамена</div>
    <div class="tip-text">Пройди все сценарии (раздел «Сценарии»), порепетируй диалоги вслух, сделай пробный письменный текст 100–150 слов. Попроси грека-друга проверить или запишись на пробный урок.</div>
  </div>
</div>`;
}

function getExamVocabHTML() {
  const topics = [
    {
      id: 'v1', title: 'Личные данные', emoji: '🪪',
      hint: 'Представление себя — часть Speaking и Writing',
      words: [
        ['το όνομα', 'то онома', 'имя'],
        ['το επώνυμο', 'то эпоними', 'фамилия'],
        ['η ηλικία', 'и иликиа', 'возраст'],
        ['η υπηκοότητα', 'и ипикоотита', 'гражданство'],
        ['η διεύθυνση', 'и диэвсинси', 'адрес'],
        ['ο αριθμός τηλεφώνου', 'о аристмос тилэфону', 'номер телефона'],
        ['η επαγγελματική εμπειρία', 'и эпангэлматики эмпириа', 'опыт работы'],
        ['παντρεμένος/η', 'пандрэмэнос/и', 'женатый/замужняя'],
        ['άγαμος/η', 'агамос/и', 'холостой/незамужняя'],
        ['έχω παιδιά', 'эхо пэдья', 'у меня есть дети'],
      ]
    },
    {
      id: 'v2', title: 'Семья', emoji: '👨‍👩‍👧',
      hint: 'Часто встречается в темах Speaking',
      words: [
        ['ο σύζυγος', 'о сизигос', 'супруг'],
        ['η σύζυγος', 'и сизигос', 'супруга'],
        ['τα παιδιά', 'та пэдья', 'дети'],
        ['ο γιος', 'о йос', 'сын'],
        ['η κόρη', 'и кори', 'дочь'],
        ['οι γονείς', 'и гонис', 'родители'],
        ['ο παππούς', 'о папус', 'дедушка'],
        ['η γιαγιά', 'и яя', 'бабушка'],
        ['ο αδελφός', 'о адэлфос', 'брат'],
        ['η αδελφή', 'и адэлфи', 'сестра'],
      ]
    },
    {
      id: 'v3', title: 'Работа и профессия', emoji: '💼',
      hint: 'Ключевая тема Writing Level A2–B1',
      words: [
        ['η δουλειά / η εργασία', 'и дуля / и эргасиа', 'работа'],
        ['ο εργοδότης', 'о эргодотис', 'работодатель'],
        ['ο μισθός', 'о мистос', 'зарплата'],
        ['το ωράριο', 'то орарьо', 'рабочее расписание'],
        ['η άδεια', 'и адья', 'отпуск / лицензия'],
        ['ο γιατρός', 'о ятрос', 'врач'],
        ['ο δάσκαλος', 'о даскалос', 'учитель'],
        ['ο μηχανικός', 'о миханикос', 'инженер/механик'],
        ['ο λογιστής', 'о лойистис', 'бухгалтер'],
        ['ο υπάλληλος', 'о ипалилос', 'сотрудник/служащий'],
      ]
    },
    {
      id: 'v4', title: 'Дом и жильё', emoji: '🏠',
      hint: 'Тема письма и диалогов на экзамене',
      words: [
        ['το διαμέρισμα', 'то диамэризма', 'квартира'],
        ['το σπίτι', 'то спити', 'дом'],
        ['το ενοίκιο', 'то эники о', 'аренда'],
        ['ο ιδιοκτήτης', 'о идиоктитис', 'хозяин/собственник'],
        ['το υπνοδωμάτιο', 'то ипнодоматьо', 'спальня'],
        ['η κουζίνα', 'и кузина', 'кухня'],
        ['το μπάνιο', 'то бано', 'ванная'],
        ['το σαλόνι', 'то салони', 'гостиная'],
        ['ο όροφος', 'о орофос', 'этаж'],
        ['ο γείτονας', 'о итонас', 'сосед'],
      ]
    },
    {
      id: 'v5', title: 'Здоровье и медицина', emoji: '🏥',
      hint: 'Диалог «у врача» — типичный Speaking сценарий',
      words: [
        ['ο πόνος', 'о понос', 'боль'],
        ['πονάει', 'понаи', 'болит'],
        ['ο πυρετός', 'о пирэтос', 'температура/жар'],
        ['το φάρμακο', 'то фармако', 'лекарство'],
        ['η συνταγή', 'и синдайи', 'рецепт'],
        ['το νοσοκομείο', 'то носокомио', 'больница'],
        ['το ιατρείο', 'то иатрио', 'кабинет врача'],
        ['το ραντεβού', 'то рандэву', 'запись/встреча'],
        ['αδιαθεσία', 'адиасэсиа', 'недомогание'],
        ['αλλεργία', 'алэрйиа', 'аллергия'],
      ]
    },
    {
      id: 'v6', title: 'Транспорт и город', emoji: '🚌',
      hint: 'Ориентация в городе — стандартная тема Speaking',
      words: [
        ['το λεωφορείο', 'то лэофорио', 'автобус'],
        ['το ταξί', 'то такси', 'такси'],
        ['ο σταθμός', 'о стасмос', 'станция/остановка'],
        ['η στάση', 'и стаси', 'остановка'],
        ['το εισιτήριο', 'то исытирьо', 'билет'],
        ['το δρόμος', 'о дромос', 'дорога/улица'],
        ['ευθεία', 'эфсиа', 'прямо'],
        ['αριστερά', 'аристэра', 'налево'],
        ['δεξιά', 'дэксья', 'направо'],
        ['κοντά / μακριά', 'конда / макрья', 'близко / далеко'],
      ]
    },
    {
      id: 'v7', title: 'Покупки и деньги', emoji: '🛒',
      hint: 'Диалог в магазине/банке — обязательная тема',
      words: [
        ['το κατάστημα', 'то катастима', 'магазин'],
        ['η τιμή', 'и тими', 'цена'],
        ['η απόδειξη', 'и аподиксы', 'чек'],
        ['φθηνός/ή', 'фтинос/и', 'дешёвый'],
        ['ακριβός/ή', 'акривос/и', 'дорогой'],
        ['πόσο κάνει;', 'посо кани', 'сколько стоит?'],
        ['πληρώνω', 'плиронο', 'платить'],
        ['ρέστα', 'рэста', 'сдача'],
        ['η πιστωτική κάρτα', 'и пистотики карта', 'кредитная карта'],
        ['η έκπτωση', 'и эктпоси', 'скидка'],
      ]
    },
    {
      id: 'v8', title: 'Досуг и хобби', emoji: '🎭',
      hint: 'Рассказ о свободном времени — Speaking тема',
      words: [
        ['ο ελεύθερος χρόνος', 'о элэфтэрос хронос', 'свободное время'],
        ['το χόμπι', 'то хоби', 'хобби'],
        ['ο κινηματογράφος', 'о кинэматографос', 'кино'],
        ['το θέατρο', 'то сэатро', 'театр'],
        ['η μουσική', 'и музики', 'музыка'],
        ['ο αθλητισμός', 'о атлитизмос', 'спорт'],
        ['ταξιδεύω', 'таксидэво', 'путешествовать'],
        ['διαβάζω', 'диаваzo', 'читать'],
        ['μαγειρεύω', 'майирэво', 'готовить'],
        ['βγαίνω έξω', 'вйэно эксо', 'выходить/гулять'],
      ]
    },
    {
      id: 'v9', title: 'Время и даты', emoji: '📅',
      hint: 'Нужны для любого письменного задания',
      words: [
        ['χθες', 'хтэс', 'вчера'],
        ['σήμερα', 'симэра', 'сегодня'],
        ['αύριο', 'аврьо', 'завтра'],
        ['την περασμένη εβδομάδα', 'тин пэразмэни эвдомада', 'на прошлой неделе'],
        ['του χρόνου', 'ту хрону', 'в следующем году'],
        ['συχνά', 'сихна', 'часто'],
        ['μερικές φορές', 'мэрикэс форэс', 'иногда'],
        ['ποτέ', 'потэ', 'никогда'],
        ['πάντα', 'панта', 'всегда'],
        ['τελευταία', 'тэлэфтэа', 'последнее время / недавно'],
      ]
    },
    {
      id: 'v10', title: 'Полезные фразы-связки', emoji: '🔗',
      hint: 'Эти слова поднимают оценку за Writing и Speaking',
      words: [
        ['επίσης', 'эпisis', 'также'],
        ['ωστόσο', 'остосо', 'однако'],
        ['επομένως', 'эпомэнос', 'следовательно'],
        ['για παράδειγμα', 'йа парадэйма', 'например'],
        ['από τη μία... από την άλλη', 'апо ти миа... апо тин али', 'с одной стороны... с другой'],
        ['συμφωνώ / διαφωνώ', 'симфоно / диафоно', 'согласен / не согласен'],
        ['κατά τη γνώμη μου', 'ката ти гноми му', 'по моему мнению'],
        ['νομίζω ότι', 'номизо оти', 'я думаю что'],
        ['θα ήθελα να', 'са итэла на', 'я бы хотел(а)'],
        ['ευχαριστώ πολύ', 'эфхаристо поли', 'большое спасибо'],
      ]
    },
  ];

  const toc = topics.map(t =>
    `<button class="gram-toc-btn" onclick="document.getElementById('${t.id}').scrollIntoView({behavior:'smooth'})">${t.emoji} ${t.title}</button>`
  ).join('');

  const blocks = topics.map(t => {
    const rows = t.words.map(([gr, tr, ru]) => `
<tr>
  <td class="vocab-ex-gr" onclick="${sp(gr)}">${gr} <span class="vocab-ex-speak">🔊</span></td>
  <td class="vocab-ex-tr">[${tr}]</td>
  <td class="vocab-ex-ru">${ru}</td>
</tr>`).join('');
    return `
<div id="${t.id}" class="gram-block">
  <div class="gram-title">${t.emoji} ${t.title}</div>
  <div class="gram-subtitle">${t.hint}</div>
  <table class="vocab-ex-table">
    <thead><tr>
      <th>Греческий</th><th>Транскрипция</th><th>Перевод</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }).join('\n');

  return `
<div class="gram-nav">
  <div class="gram-toc">${toc}</div>
</div>
<div class="vocab-ex-intro">100 ключевых слов по темам экзамена. Нажми 🔊 чтобы услышать.</div>
${blocks}`;
}

// ===================== EXAM MOCK TEST (sprint 6) =====================

const EXAM_MOCK_QUESTIONS = [
  // -- GRAMMAR --
  {
    type: 'grammar',
    q: 'Выбери правильную форму глагола:\nΕγώ ___ στην Κύπρο.',
    opts: ['μένω', 'μένεις', 'μένει', 'μένουμε'],
    correct: 0,
    exp: 'Εγώ (я) → 1-е лицо ед.ч.: μένω'
  },
  {
    type: 'grammar',
    q: 'Выбери правильную форму:\nΗ Μαρία ___ καφέ κάθε πρωί.',
    opts: ['πίνει', 'πίνω', 'πίνετε', 'πίνουν'],
    correct: 0,
    exp: 'Η Μαρία — 3-е лицо ед.ч.: πίνει'
  },
  {
    type: 'grammar',
    q: 'Прошедшее время (αόριστος). Выбери верное:\nΧθες εγώ ___ στο σούπερ μάρκετ.',
    opts: ['πήγα', 'πάω', 'πηγαίνω', 'πάμε'],
    correct: 0,
    exp: 'Αόριστος от πηγαίνω (я шёл/пошёл) → πήγα'
  },
  {
    type: 'grammar',
    q: 'Будущее время θα. Выбери верное:\nΑύριο εμείς ___ στη θάλασσα.',
    opts: ['θα πάμε', 'θα πάω', 'θα πάει', 'πάμε'],
    correct: 0,
    exp: 'Εμείς (мы) + θα → θα πάμε'
  },
  {
    type: 'grammar',
    q: 'Выбери правильный артикль:\n___ δάσκαλος είναι πολύ καλός.',
    opts: ['Ο', 'Η', 'Το', 'Τα'],
    correct: 0,
    exp: 'δάσκαλος — мужской род → ο δάσκαλος'
  },
  {
    type: 'grammar',
    q: 'Вин. падеж. Выбери верное:\nΑγαπώ ___ μητέρα μου.',
    opts: ['την', 'η', 'της', 'τη'],
    correct: 0,
    exp: 'Вин. падеж жен. рода ед.ч. → την (перед согласным: τη)'
  },
  // -- VOCABULARY --
  {
    type: 'vocab',
    q: 'Что значит слово «το ενοίκιο»?',
    opts: ['аренда/арендная плата', 'электричество', 'страховка', 'налог'],
    correct: 0,
    exp: 'Το ενοίκιο = арендная плата, аренда квартиры'
  },
  {
    type: 'vocab',
    q: 'Выбери верный перевод:\n«Έχω πυρετό»',
    opts: ['У меня температура', 'Мне холодно', 'У меня болит голова', 'Я устал'],
    correct: 0,
    exp: 'Πυρετός = жар/температура; έχω πυρετό = у меня жар'
  },
  {
    type: 'vocab',
    q: 'Как по-гречески «скидка»?',
    opts: ['η έκπτωση', 'η απόδειξη', 'η τιμή', 'η πληρωμή'],
    correct: 0,
    exp: 'Η έκπτωση = скидка'
  },
  {
    type: 'vocab',
    q: 'Что значит «αριστερά»?',
    opts: ['налево', 'направо', 'прямо', 'назад'],
    correct: 0,
    exp: 'Αριστερά = налево; δεξιά = направо; ευθεία = прямо'
  },
  // -- READING --
  {
    type: 'reading',
    passage: 'Η Άννα είναι νοσοκόμα. Δουλεύει σε νοσοκομείο στη Λευκωσία. Κάθε μέρα πηγαίνει στη δουλειά με το λεωφορείο.',
    q: 'Πού δουλεύει η Άννα;',
    opts: ['Σε νοσοκομείο', 'Σε σχολείο', 'Σε φαρμακείο', 'Στο σούπερ μάρκετ'],
    correct: 0,
    exp: 'В тексте: «Δουλεύει σε νοσοκομείο» — работает в больнице'
  },
  {
    type: 'reading',
    passage: 'Η Άννα είναι νοσοκόμα. Δουλεύει σε νοσοκομείο στη Λευκωσία. Κάθε μέρα πηγαίνει στη δουλειά με το λεωφορείο.',
    q: 'Πώς πηγαίνει στη δουλειά;',
    opts: ['Με το λεωφορείο', 'Με το αυτοκίνητο', 'Με το ταξί', 'Με τα πόδια'],
    correct: 0,
    exp: 'В тексте: «πηγαίνει στη δουλειά με το λεωφορείο» — на автобусе'
  },
  {
    type: 'grammar',
    q: 'Выбери правильный предлог:\nΠηγαίνω ___ δουλειά κάθε μέρα.',
    opts: ['στη', 'από', 'με', 'για'],
    correct: 0,
    exp: 'Πηγαίνω στη δουλειά = иду на работу (στη = σε + τη)'
  },
  {
    type: 'vocab',
    q: 'Фраза «κατά τη γνώμη μου» означает:',
    opts: ['по моему мнению', 'в конце концов', 'с другой стороны', 'например'],
    correct: 0,
    exp: 'Κατά τη γνώμη μου = по моему мнению — важная фраза для Speaking/Writing'
  },
  {
    type: 'grammar',
    q: 'Выбери верную конструкцию:\nΘέλω ___ πάω στην παραλία.',
    opts: ['να', 'θα', 'ότι', 'που'],
    correct: 0,
    exp: 'Θέλω να + гл. = хочу + инфинитив (θέλω να πάω = хочу пойти)'
  },
];

let examTestState = { idx: 0, score: 0, answered: false };

function startExamMockTest() {
  document.getElementById('exam-detail-title').textContent = '📝 Пробный тест A2';
  examTestState = { idx: 0, score: 0, answered: false };
  renderExamTestQuestion();
  showScreen('screen-exam-detail');
}

function renderExamTestQuestion() {
  const body = document.getElementById('exam-detail-body');
  const { idx, score } = examTestState;
  const total = EXAM_MOCK_QUESTIONS.length;

  if (idx >= total) {
    const pct = Math.round(score / total * 100);
    const medal = pct >= 80 ? '🥇' : pct >= 60 ? '🥈' : '💪';
    const msg = pct >= 80 ? 'Отличный результат! Ты готов к экзамену.' :
                pct >= 60 ? 'Хороший результат. Повтори слабые темы.' :
                'Продолжай учиться — каждая попытка делает тебя лучше.';
    body.innerHTML = `
<div class="mock-result">
  <div class="mock-result-medal">${medal}</div>
  <div class="mock-result-score">${score} / ${total}</div>
  <div class="mock-result-pct">${pct}%</div>
  <div class="mock-result-msg">${msg}</div>
  <button class="btn-primary" style="margin-top:20px" onclick="startExamMockTest()">Пройти снова</button>
</div>`;
    return;
  }

  const q = EXAM_MOCK_QUESTIONS[idx];
  const typeLbl = { grammar: '📚 Грамматика', vocab: '📖 Лексика', reading: '📄 Чтение' }[q.type];
  const passage = q.passage
    ? `<div class="mock-passage">${q.passage}</div>`
    : '';
  const opts = q.opts.map((o, i) => `
    <button class="mock-opt" id="mock-opt-${i}" onclick="selectExamTestOpt(${i})">${String.fromCharCode(65+i)}. ${o}</button>
  `).join('');

  body.innerHTML = `
<div class="mock-progress-row">
  <div class="mock-progress-bar"><div class="mock-progress-fill" style="width:${idx/total*100}%"></div></div>
  <span class="mock-progress-lbl">${idx+1} / ${total}</span>
</div>
<div class="mock-type-badge">${typeLbl}</div>
${passage}
<div class="mock-question">${q.q.replace(/\n/g, '<br>')}</div>
<div class="mock-opts" id="mock-opts">${opts}</div>
<div class="mock-explanation" id="mock-exp" style="display:none"></div>
<button class="btn-primary mock-next-btn" id="mock-next" style="display:none" onclick="nextExamTestQuestion()">
  ${idx + 1 < total ? 'Следующий вопрос →' : 'Показать результат'}
</button>`;
}

function selectExamTestOpt(i) {
  if (examTestState.answered) return;
  examTestState.answered = true;
  const q = EXAM_MOCK_QUESTIONS[examTestState.idx];
  const correct = q.correct;
  if (i === correct) examTestState.score++;

  document.querySelectorAll('.mock-opt').forEach((btn, j) => {
    btn.disabled = true;
    if (j === correct) btn.classList.add('mock-opt-correct');
    else if (j === i) btn.classList.add('mock-opt-wrong');
  });

  const expEl = document.getElementById('mock-exp');
  expEl.textContent = (i === correct ? '✅ ' : '❌ ') + q.exp;
  expEl.style.display = 'block';
  document.getElementById('mock-next').style.display = 'block';
}

function nextExamTestQuestion() {
  examTestState.idx++;
  examTestState.answered = false;
  renderExamTestQuestion();
}

// ===================== EXAM LISTENING (sprint 7) =====================

const EXAM_LISTENING_TRACKS = [
  {
    title: 'Τηλεφωνική κλήση',
    titleRu: 'Звонок в клинику',
    emoji: '📞',
    text: 'Καλημέρα, θέλω να κλείσω ένα ραντεβού με τον γιατρό. Είμαι η Μαρία Παπαδοπούλου. Έχω πονοκέφαλο και πυρετό από χθες. Μπορώ να έρθω αύριο το πρωί στις δέκα;',
    textRu: 'Доброе утро, я хочу записаться к врачу. Я Мария Пападопулу. У меня головная боль и температура со вчерашнего дня. Могу ли я прийти завтра утром в десять?',
    questions: [
      { q: 'Τι θέλει η Μαρία;', opts: ['Να κλείσει ραντεβού', 'Να αγοράσει φάρμακα', 'Να μιλήσει με νοσοκόμα', 'Να πάει στο νοσοκομείο'], correct: 0, exp: 'Μαρία говорит: «θέλω να κλείσω ένα ραντεβού» — хочу записаться' },
      { q: 'Τι έχει η Μαρία;', opts: ['Πονοκέφαλο και πυρετό', 'Πόνο στην πλάτη', 'Κρύο και βήχα', 'Στομαχόπονο'], correct: 0, exp: 'Она говорит: «έχω πονοκέφαλο και πυρετό» — головная боль и температура' },
      { q: 'Πότε θέλει να έρθει;', opts: ['Αύριο το πρωί', 'Σήμερα το απόγευμα', 'Μεθαύριο', 'Την Παρασκευή'], correct: 0, exp: 'Она говорит: «αύριο το πρωί στις δέκα» — завтра утром в десять' },
    ]
  },
  {
    title: 'Ανακοίνωση στο σούπερ μάρκετ',
    titleRu: 'Объявление в супермаркете',
    emoji: '🛒',
    text: 'Αγαπητοί πελάτες, σας ενημερώνουμε ότι σήμερα έχουμε μεγάλες εκπτώσεις στο τμήμα των φρούτων και λαχανικών. Επίσης, από τις έξι το απόγευμα, το κατάστημα θα κλείσει νωρίτερα λόγω αργίας. Σας ευχαριστούμε για την κατανόησή σας.',
    textRu: 'Уважаемые покупатели, сообщаем вам, что сегодня у нас большие скидки в отделе фруктов и овощей. Также с шести вечера магазин закроется раньше в связи с праздником. Благодарим за понимание.',
    questions: [
      { q: 'Πού υπάρχουν εκπτώσεις;', opts: ['Φρούτα και λαχανικά', 'Κρέας και ψάρια', 'Ποτά', 'Είδη καθαρισμού'], correct: 0, exp: 'В объявлении: «εκπτώσεις στο τμήμα των φρούτων και λαχανικών»' },
      { q: 'Πότε κλείνει το κατάστημα;', opts: ['Στις έξι το απόγευμα', 'Στις οκτώ', 'Στις εννιά', 'Στις δέκα'], correct: 0, exp: '«από τις έξι το απόγευμα, το κατάστημα θα κλείσει»' },
      { q: 'Γιατί κλείνει νωρίς;', opts: ['Λόγω αργίας', 'Λόγω επισκευής', 'Λόγω απεργίας', 'Λόγω καθαρισμού'], correct: 0, exp: '«θα κλείσει νωρίτερα λόγω αργίας» — из-за праздника' },
    ]
  },
  {
    title: 'Διάλογος για ενοίκιο',
    titleRu: 'Разговор об аренде',
    emoji: '🏠',
    text: '— Καλησπέρα, είδα την αγγελία σας για το διαμέρισμα. Είναι ακόμα διαθέσιμο;\n— Ναι, είναι. Είναι δύο υπνοδωμάτια, στον τρίτο όροφο. Το ενοίκιο είναι οκτακόσια ευρώ το μήνα.\n— Περιλαμβάνει τα κοινόχρηστα;\n— Ναι, περιλαμβάνει νερό και σκουπίδια, αλλά όχι ρεύμα.',
    textRu: '— Добрый вечер, я видел ваше объявление о квартире. Она ещё свободна?\n— Да. Две спальни, третий этаж. Аренда 800 евро в месяц.\n— Включены ли коммунальные?\n— Да, включает воду и мусор, но не электричество.',
    questions: [
      { q: 'Πόσα υπνοδωμάτια έχει το διαμέρισμα;', opts: ['Δύο', 'Ένα', 'Τρία', 'Τέσσερα'], correct: 0, exp: '«Είναι δύο υπνοδωμάτια» — две спальни' },
      { q: 'Πόσο είναι το ενοίκιο;', opts: ['800 ευρώ', '600 ευρώ', '1000 ευρώ', '750 ευρώ'], correct: 0, exp: '«Το ενοίκιο είναι οκτακόσια ευρώ» — 800 евро' },
      { q: 'Τι ΔΕΝ περιλαμβάνεται στο ενοίκιο;', opts: ['Το ρεύμα', 'Το νερό', 'Τα σκουπίδια', 'Η θέρμανση'], correct: 0, exp: '«αλλά όχι ρεύμα» — электричество не включено' },
    ]
  },
  {
    title: 'Μήνυμα στον τηλεφωνητή',
    titleRu: 'Сообщение на автоответчике',
    emoji: '📱',
    text: 'Γεια σου Νίκο, είμαι η Ελένη. Σε καλώ για να θυμηθείς ότι αύριο έχουμε μάθημα ελληνικών στις επτά το βράδυ. Το μάθημα γίνεται στο πολιτιστικό κέντρο στην οδό Μακαρίου. Αν δεν μπορείς να έρθεις, παρακαλώ στείλε μου μήνυμα.',
    textRu: 'Привет, Нико, это Элени. Звоню напомнить, что завтра у нас урок греческого в семь вечера. Занятие проходит в культурном центре на улице Макариу. Если не сможешь прийти, пожалуйста, напиши мне.',
    questions: [
      { q: 'Πότε είναι το μάθημα;', opts: ['Αύριο στις 7 το βράδυ', 'Σήμερα στις 7', 'Αύριο το πρωί', 'Μεθαύριο'], correct: 0, exp: '«αύριο έχουμε μάθημα... στις επτά το βράδυ» — завтра в 7 вечера' },
      { q: 'Πού γίνεται το μάθημα;', opts: ['Πολιτιστικό κέντρο', 'Σχολείο', 'Βιβλιοθήκη', 'Σπίτι της Ελένης'], correct: 0, exp: '«γίνεται στο πολιτιστικό κέντρο» — в культурном центре' },
      { q: 'Τι να κάνει ο Νίκος αν δεν μπορεί να έρθει;', opts: ['Να στείλει μήνυμα', 'Να τηλεφωνήσει', 'Να έρθει αργότερα', 'Να στείλει email'], correct: 0, exp: '«παρακαλώ στείλε μου μήνυμα» — написать сообщение' },
    ]
  },
  {
    title: 'Οδηγίες στην πόλη',
    titleRu: 'Маршрут по городу',
    emoji: '🗺️',
    text: 'Για να πάτε στο δημαρχείο, πηγαίνετε ευθεία στην κεντρική οδό για διακόσια μέτρα. Στο πρώτο φανάρι, στρίψτε αριστερά. Συνεχίστε για εκατό μέτρα και το δημαρχείο είναι στα δεξιά σας, δίπλα στην τράπεζα.',
    textRu: 'Чтобы добраться до мэрии, идите прямо по центральной улице 200 метров. На первом светофоре поверните налево. Продолжайте 100 метров — мэрия будет справа от вас, рядом с банком.',
    questions: [
      { q: 'Πού στρίβει κανείς στο φανάρι;', opts: ['Αριστερά', 'Δεξιά', 'Ευθεία', 'Πίσω'], correct: 0, exp: '«στρίψτε αριστερά» — поверните налево' },
      { q: 'Πού βρίσκεται το δημαρχείο;', opts: ['Στα δεξιά, δίπλα στην τράπεζα', 'Στα αριστερά', 'Απέναντι από το φανάρι', 'Δίπλα στο σχολείο'], correct: 0, exp: '«στα δεξιά σας, δίπλα στην τράπεζα» — справа, рядом с банком' },
      { q: 'Πόσα μέτρα να πάει κανείς ευθεία πρώτα;', opts: ['200 μέτρα', '100 μέτρα', '300 μέτρα', '500 μέτρα'], correct: 0, exp: '«ευθεία... για διακόσια μέτρα» — 200 метров прямо' },
    ]
  },
];

let listeningState = { trackIdx: null, answered: [], ttsPlaying: false };

function startExamListening() {
  document.getElementById('exam-detail-title').textContent = '🎧 Аудирование';
  listeningState = { trackIdx: null, answered: [], ttsPlaying: false };
  renderListeningTracks();
  showScreen('screen-exam-detail');
}

function renderListeningTracks() {
  const cards = EXAM_LISTENING_TRACKS.map((t, i) => {
    const done = listeningState.answered[i] !== undefined;
    const score = done ? listeningState.answered[i] : null;
    const badge = done ? `<span class="listen-done-badge">${score}/${t.questions.length}</span>` : '';
    return `
<div class="listen-track-card${done ? ' listen-track-done' : ''}" onclick="startListeningTrack(${i})">
  <span class="listen-track-emoji">${t.emoji}</span>
  <div class="listen-track-info">
    <div class="listen-track-title">${t.title}</div>
    <div class="listen-track-sub">${t.titleRu} · ${t.questions.length} вопроса</div>
  </div>
  ${badge}
  <span class="listen-track-arrow">${done ? '✓' : '›'}</span>
</div>`;
  }).join('');

  const totalDone = listeningState.answered.filter(x => x !== undefined).length;
  document.getElementById('exam-detail-body').innerHTML = `
<div class="listen-intro">Нажми ▶ чтобы услышать текст, затем ответь на вопросы. Текст скрыт — тренируй настоящее слушание.</div>
<div class="listen-tracks">${cards}</div>
${totalDone > 0 ? `<div class="listen-total">Пройдено: ${totalDone} / ${EXAM_LISTENING_TRACKS.length}</div>` : ''}`;
}

function startListeningTrack(idx) {
  listeningState.trackIdx = idx;
  listeningState.ttsPlaying = false;
  renderListeningTrack();
}

function renderListeningTrack() {
  const idx = listeningState.trackIdx;
  const t = EXAM_LISTENING_TRACKS[idx];
  const qs = t.questions.map((q, qi) => `
<div class="listen-q-block" id="listen-q-${qi}">
  <div class="listen-q-text">${qi+1}. ${q.q}</div>
  <div class="mock-opts">${q.opts.map((o, oi) =>
    `<button class="mock-opt" id="lopt-${qi}-${oi}" onclick="answerListeningQ(${idx},${qi},${oi})">${String.fromCharCode(65+oi)}. ${o}</button>`
  ).join('')}</div>
  <div class="mock-explanation" id="listen-exp-${qi}" style="display:none"></div>
</div>`).join('');

  document.getElementById('exam-detail-body').innerHTML = `
<button class="btn-back-inline" onclick="renderListeningTracks()">← К списку</button>
<div class="listen-track-header">
  <span style="font-size:28px">${t.emoji}</span>
  <div>
    <div class="listen-th-title">${t.title}</div>
    <div class="listen-th-sub">${t.titleRu}</div>
  </div>
</div>
<div class="listen-play-area">
  <button class="listen-play-btn" id="listen-play-btn" onclick="playListeningTrack(${idx})">▶ Слушать</button>
  <div class="listen-play-hint">Нажми — текст озвучится по-гречески</div>
</div>
<div id="listen-transcript" class="listen-transcript" style="display:none">${t.text.replace(/\n/g,'<br>')}</div>
<button class="listen-reveal-btn" id="listen-reveal-btn" onclick="toggleListeningTranscript()">👁 Показать текст</button>
<div class="listen-qs-title">Вопросы по тексту:</div>
<div id="listen-qs">${qs}</div>
<div id="listen-track-result" style="display:none"></div>`;
}

function playListeningTrack(idx) {
  const t = EXAM_LISTENING_TRACKS[idx];
  const btn = document.getElementById('listen-play-btn');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); btn.textContent = '▶ Слушать'; return; }
  const utt = new SpeechSynthesisUtterance(t.text.replace(/\n/g, ' '));
  utt.lang = 'el-GR';
  utt.rate = 0.85;
  const voices = speechSynthesis.getVoices();
  const elVoice = voices.find(v => v.lang.startsWith('el'));
  if (elVoice) utt.voice = elVoice;
  utt.onstart = () => { btn.textContent = '⏹ Остановить'; };
  utt.onend = utt.onerror = () => { btn.textContent = '▶ Слушать снова'; };
  speechSynthesis.speak(utt);
}

function toggleListeningTranscript() {
  const el = document.getElementById('listen-transcript');
  const btn = document.getElementById('listen-reveal-btn');
  const hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '👁 Скрыть текст' : '👁 Показать текст';
}

let listenQScores = {};

function answerListeningQ(trackIdx, qi, oi) {
  const t = EXAM_LISTENING_TRACKS[trackIdx];
  const q = t.questions[qi];
  const key = `${trackIdx}-${qi}`;
  if (listenQScores[key] !== undefined) return;

  const correct = q.correct;
  listenQScores[key] = (oi === correct) ? 1 : 0;

  document.querySelectorAll(`[id^="lopt-${qi}-"]`).forEach(btn => {
    const btnOi = parseInt(btn.id.split('-')[2]);
    btn.disabled = true;
    if (btnOi === correct) btn.classList.add('mock-opt-correct');
    else if (btnOi === oi) btn.classList.add('mock-opt-wrong');
  });
  const expEl = document.getElementById(`listen-exp-${qi}`);
  expEl.textContent = (oi === correct ? '✅ ' : '❌ ') + q.exp;
  expEl.style.display = 'block';

  const allAnswered = t.questions.every((_, i) => listenQScores[`${trackIdx}-${i}`] !== undefined);
  if (allAnswered) {
    const score = t.questions.reduce((s, _, i) => s + (listenQScores[`${trackIdx}-${i}`] || 0), 0);
    if (!listeningState.answered) listeningState.answered = [];
    listeningState.answered[trackIdx] = score;
    const pct = Math.round(score / t.questions.length * 100);
    document.getElementById('listen-track-result').innerHTML = `
<div class="listen-result-bar">
  ${pct >= 67 ? '✅' : '💪'} Результат: <strong>${score}/${t.questions.length}</strong>
  <button class="btn-back-inline" style="margin-left:auto" onclick="renderListeningTracks()">← К списку</button>
</div>`;
    document.getElementById('listen-track-result').style.display = 'block';
  }
}
