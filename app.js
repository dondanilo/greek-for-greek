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
let currentUser = null;

let _signingIn = false;
function signInWithGoogle() {
  if (_signingIn) return;
  _signingIn = true;
  const btn = document.querySelector('.btn-google-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Подождите...'; }

  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .catch(err => {
      // Тихо игнорируем: пользователь закрыл окно или нажал дважды
      if (err.code === 'auth/cancelled-popup-request' ||
          err.code === 'auth/popup-closed-by-user') return;
      alert('Ошибка входа: ' + err.message);
    })
    .finally(() => {
      _signingIn = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="google-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="22" height="22"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.5-3.1-11.3-7.6l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.9 2.4-2.5 4.5-4.5 5.9l.1-.1 6.2 5.2C36.9 40.7 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg> Войти через Google'; }
    });
}

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
  onboardingDone: false
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
  const sub = state.subscription;
  if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
    return true;
  }

  // 2. Also check subscriptions/{email} as fallback
  try {
    const email = currentUser.email?.toLowerCase();
    if (email) {
      const doc = await db.collection('subscriptions').doc(email).get();
      if (doc.exists) {
        const s = doc.data();
        if (s.status === 'active' || s.status === 'trialing') {
          // Sync to state
          state.subscription = { status: s.status, expiresAt: s.expiresAt };
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Auto-reload when new SW activates with fresh assets
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SW_UPDATED') window.location.reload();
    });
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
      const wrongs = VERBS.filter(v => v.id !== verb.id).sort(() => Math.random() - 0.5).slice(0, 3).map(v => v.translation);
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
    const extra = VERBS.find(v => v.id !== verb.id);
    allForms.push(...Object.values(extra.present).filter(f => f !== correctForm));
  }
  return shuffle(allForms).slice(0, 3);
}

function getWrongMeanings(verb, pronoun) {
  const pRu = PRONOUNS_RU[pronoun];
  return VERBS.filter(v => v.id !== verb.id).sort(() => Math.random() - 0.5).slice(0, 3).map(v => `${pRu} ${v.translation}`);
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ============================================================
// LESSON — FLOW
// ============================================================
function startLesson() {
  lessonState = { exercises: generateLesson(), currentIndex: 0, hearts: 3, xpEarned: 0, correct: 0, answered: false, isWeakMode: false };
  showScreen('screen-lesson');
  renderExercise();
}

function startWeakLesson() {
  const weakIds = Object.keys(state.errorLog)
    .sort((a, b) => state.errorLog[b] - state.errorLog[a])
    .map(id => parseInt(id));
  const weakVerbs = VERBS.filter(v => weakIds.includes(v.id));
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
  saveState();
  checkAchievements({ perfectLesson: isPerfect, weakMode: lessonState.isWeakMode });

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
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'el-GR';
  utterance.rate = 0.85;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
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
  return VERBS.filter(v => state.srs[v.id]?.due <= today);
}

function getSrsDueCount() {
  return getSrsDueVerbs().length;
}

function renderSrsStats() {
  if (!state.srs) state.srs = {};
  const total = VERBS.length;
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
  VERBS.forEach(v => {
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

function checkAchievements(ctx = {}) {
  if (!state.achievements) state.achievements = [];
  const conditions = {
    'first_lesson':   state.lessonsCompleted >= 1,
    'perfect_lesson': ctx.perfectLesson === true,
    'lessons_5':      state.lessonsCompleted >= 5,
    'lessons_10':     state.lessonsCompleted >= 10,
    'lessons_30':     state.lessonsCompleted >= 30,
    'streak_3':       state.streak >= 3,
    'streak_7':       state.streak >= 7,
    'streak_30':      state.streak >= 30,
    'scenario_first': state.scenariosCompleted.length >= 1,
    'scenarios_all':  state.scenariosCompleted.length >= SCENARIOS.length,
    'citizenship':    state.scenariosCompleted.includes('citizenship'),
    'weak_conquered': ctx.weakMode === true,
    'xp_500':         state.totalXp >= 500,
    'xp_2000':        state.totalXp >= 2000,
    'level_5':        state.level >= 5,
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
    newlyUnlocked.forEach(a => achToastQueue.push(a));
    if (achToastQueue.length === newlyUnlocked.length) processAchToast();
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
    ? VERBS.filter(v =>
        v.infinitive.toLowerCase().includes(q) ||
        v.translation.toLowerCase().includes(q) ||
        Object.values(v.present).some(f => f.toLowerCase().includes(q))
      )
    : VERBS;
  renderVerbCards(filtered);
}

function showVerbTable() {
  document.getElementById('verb-search').value = '';
  renderVerbCards(VERBS);
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

  showScreen('screen-phrases');
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
      const verb = VERBS.find(v => v.id === parseInt(id));
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
    async () => {
      const res = await fetchWithTimeout(`https://corsproxy.io/?${encoded}`, 8000);
      return await res.text();
    },
    async () => {
      const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encoded}`, 8000);
      const d = await res.json();
      return d.contents;
    },
    async () => {
      const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encoded}&count=20`, 8000);
      const d = await res.json();
      if (d.items?.length) {
        return d.items.map(i => ({
          title: i.title, link: i.link, pubDate: i.pubDate,
          thumbnail: i.thumbnail || '', source: ''
        }));
      }
      return null;
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
  document.getElementById('vocab-screen-desc').textContent = mode === 'image'
    ? 'Выбери картинку, которая соответствует греческому слову.'
    : 'Выбери правильный перевод греческого слова.';

  document.getElementById('vocab-categories-list').innerHTML =
    `<div class="vocab-categories-grid">${VOCAB_CATEGORIES.map(cat => `
      <div class="vocab-category-card" onclick="startVocabQuiz('${cat.id}')">
        <div class="vocab-cat-icon">${cat.emoji}</div>
        <div class="vocab-cat-title">${cat.title}</div>
      </div>`).join('')}</div>`;

  showScreen('screen-vocab');
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
  const pct = score / totalWords;
  document.getElementById('vocab-complete-stars').textContent = pct === 1 ? '⭐⭐⭐' : pct >= 0.7 ? '⭐⭐' : '⭐';
  document.getElementById('vocab-complete-score').textContent = `${score}/${totalWords}`;
  document.getElementById('vocab-complete-xp').textContent = `+${xp}`;
  showScreen('screen-vocab-complete');
}

function restartVocabQuiz() { startVocabQuiz(vocabQuizState.categoryId); }
function exitVocabQuiz() { showVocab(currentVocabMode); }

function speakGreek(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'el-GR';
    utt.rate = 0.85;
    window.speechSynthesis.speak(utt);
  }
}

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
