// ============================================================
// STATE
// ============================================================
const DEFAULT_STATE = {
  streak: 0,
  lastPlayed: null,
  totalXp: 0,
  dailyXp: 0,
  dailyGoal: 50,
  level: 1
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

const XP_PER_CORRECT = 10;
const EXERCISES_PER_LESSON = 10;

const PRONOUNS = [
  "εγώ",
  "εσύ",
  "αυτός/ή/ό",
  "εμείς",
  "εσείς",
  "αυτοί/ές/ά"
];

const PRONOUNS_RU = {
  "εγώ": "я",
  "εσύ": "ты",
  "αυτός/ή/ό": "он/она/оно",
  "εμείς": "мы",
  "εσείς": "вы",
  "αυτοί/ές/ά": "они"
};

// ============================================================
// PERSISTENCE
// ============================================================
function loadState() {
  try {
    const saved = localStorage.getItem('greek-app-state');
    if (saved) {
      state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
    }
  } catch (e) {
    state = { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem('greek-app-state', JSON.stringify(state));
}

// ============================================================
// STREAK LOGIC
// ============================================================
function updateStreakForNewDay() {
  const today = new Date().toDateString();
  if (state.lastPlayed === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (state.lastPlayed !== yesterdayStr && state.lastPlayed !== null) {
    state.streak = 0;
  }

  state.dailyXp = 0;
  saveState();
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadState();
  updateStreakForNewDay();
  renderHome();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ============================================================
// HOME SCREEN
// ============================================================
function renderHome() {
  document.getElementById('streak-number').textContent = state.streak;
  document.getElementById('total-xp').textContent = state.totalXp;
  document.getElementById('level-display').textContent = state.level;
  document.getElementById('verbs-count').textContent = VERBS.length;

  const pct = Math.min(100, (state.dailyXp / state.dailyGoal) * 100);
  document.getElementById('daily-progress').style.width = pct + '%';
  document.getElementById('daily-xp-display').textContent =
    `${state.dailyXp} / ${state.dailyGoal} XP`;

  const streakCard = document.querySelector('.streak-card');
  if (state.streak === 0) {
    streakCard.classList.add('streak-zero');
  } else {
    streakCard.classList.remove('streak-zero');
  }
}

function showHome() {
  showScreen('screen-home');
  renderHome();
}

// ============================================================
// LESSON GENERATION
// ============================================================
function generateLesson() {
  const exercises = [];

  for (let i = 0; i < EXERCISES_PER_LESSON; i++) {
    const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
    const type = Math.floor(Math.random() * 4);

    if (type === 0) {
      // Conjugation: pick correct form for given pronoun
      const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];
      const correct = verb.present[pronoun];
      const wrongs = getWrongForms(verb, correct);
      exercises.push({
        type: 'conjugation',
        verb,
        pronoun,
        correctAnswer: correct,
        options: shuffle([correct, ...wrongs])
      });

    } else if (type === 1) {
      // Phrase meaning: what does "εγώ έχω" mean?
      const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];
      const form = verb.present[pronoun];
      const pronounRu = PRONOUNS_RU[pronoun];
      const correct = `${pronounRu} ${verb.translation}`;
      exercises.push({
        type: 'phrase_meaning',
        greek: `${pronoun} ${form}`,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongMeanings(verb, pronoun)])
      });

    } else if (type === 2) {
      // Word meaning: what does infinitive mean?
      const correct = verb.translation;
      const wrongs = VERBS
        .filter(v => v.id !== verb.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(v => v.translation);
      exercises.push({
        type: 'word_meaning',
        greek: verb.infinitive,
        correctAnswer: correct,
        options: shuffle([correct, ...wrongs])
      });

    } else {
      // Translate to Greek: "я хочу" -> choose form
      const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];
      const correct = verb.present[pronoun];
      const wrongs = getWrongForms(verb, correct);
      exercises.push({
        type: 'translate_to_greek',
        russian: `${PRONOUNS_RU[pronoun]} ${verb.translation}`,
        verb,
        pronoun,
        correctAnswer: correct,
        options: shuffle([correct, ...wrongs])
      });
    }
  }

  return exercises;
}

function getWrongForms(verb, correctForm) {
  const allForms = Object.values(verb.present);
  const others = allForms.filter(f => f !== correctForm);
  // Supplement from other verbs if needed
  if (others.length < 3) {
    const extraVerb = VERBS.find(v => v.id !== verb.id);
    const extra = Object.values(extraVerb.present).filter(f => f !== correctForm);
    others.push(...extra);
  }
  return shuffle(others).slice(0, 3);
}

function getWrongMeanings(verb, pronoun) {
  const pronounRu = PRONOUNS_RU[pronoun];
  return VERBS
    .filter(v => v.id !== verb.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(v => `${pronounRu} ${v.translation}`);
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ============================================================
// LESSON FLOW
// ============================================================
function startLesson() {
  lessonState = {
    exercises: generateLesson(),
    currentIndex: 0,
    hearts: 3,
    xpEarned: 0,
    correct: 0,
    answered: false
  };
  showScreen('screen-lesson');
  renderExercise();
}

function renderExercise() {
  const ex = lessonState.exercises[lessonState.currentIndex];
  lessonState.answered = false;

  // Progress bar
  const pct = (lessonState.currentIndex / EXERCISES_PER_LESSON) * 100;
  document.getElementById('lesson-progress').style.width = pct + '%';

  // Hearts
  renderHearts();

  // XP
  document.getElementById('lesson-xp').textContent = lessonState.xpEarned;

  // Hide footer
  const footer = document.getElementById('lesson-footer');
  footer.style.display = 'none';
  footer.className = 'lesson-footer';

  const labelEl = document.getElementById('exercise-label');
  const questionEl = document.getElementById('exercise-question');
  const subtitleEl = document.getElementById('exercise-subtitle');
  const optionsEl = document.getElementById('options-grid');

  if (ex.type === 'conjugation') {
    labelEl.textContent = 'Выбери правильную форму';
    questionEl.textContent = ex.verb.infinitive;
    subtitleEl.textContent =
      `${ex.pronoun}  (${PRONOUNS_RU[ex.pronoun]})  —  ${ex.verb.translation}`;

  } else if (ex.type === 'phrase_meaning') {
    labelEl.textContent = 'Что это значит?';
    questionEl.textContent = ex.greek;
    subtitleEl.textContent = '';

  } else if (ex.type === 'word_meaning') {
    labelEl.textContent = 'Что значит этот глагол?';
    questionEl.textContent = ex.greek;
    subtitleEl.textContent = '';

  } else if (ex.type === 'translate_to_greek') {
    labelEl.textContent = 'Переведи на греческий';
    questionEl.textContent = ex.russian;
    subtitleEl.textContent = ex.verb.infinitive + '  —  ' + ex.verb.translation;
  }

  // Render option buttons
  optionsEl.innerHTML = '';
  ex.options.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = option;
    btn.addEventListener('click', () => selectAnswer(option, ex.correctAnswer));
    optionsEl.appendChild(btn);
  });
}

function renderHearts() {
  const h = lessonState.hearts;
  const el = document.getElementById('hearts-display');
  el.innerHTML =
    '<span class="heart-icon">❤️</span>'.repeat(h) +
    '<span class="heart-icon dead">🖤</span>'.repeat(3 - h);
}

function selectAnswer(selected, correct) {
  if (lessonState.answered) return;
  lessonState.answered = true;

  const buttons = document.querySelectorAll('.option-btn');
  const footer = document.getElementById('lesson-footer');
  const feedback = document.getElementById('feedback-message');
  const continueBtn = document.getElementById('continue-btn');

  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) btn.classList.add('correct');
  });

  const isCorrect = selected === correct;

  if (isCorrect) {
    lessonState.correct++;
    lessonState.xpEarned += XP_PER_CORRECT;
    document.getElementById('lesson-xp').textContent = lessonState.xpEarned;

    feedback.textContent = randomCorrectPhrase();
    feedback.className = 'feedback-message correct';
    footer.className = 'lesson-footer correct-footer';

    buttons.forEach(btn => {
      if (btn.textContent === selected) btn.classList.add('correct');
    });

    playSound('correct');

  } else {
    lessonState.hearts--;
    renderHearts();

    feedback.innerHTML = `Правильно: <strong>${correct}</strong>`;
    feedback.className = 'feedback-message wrong';
    footer.className = 'lesson-footer wrong-footer';

    buttons.forEach(btn => {
      if (btn.textContent === selected) btn.classList.add('wrong');
    });

    playSound('wrong');
  }

  footer.style.display = 'flex';

  if (lessonState.hearts <= 0) {
    continueBtn.textContent = 'Завершить урок';
  } else {
    continueBtn.textContent = 'Продолжить';
  }
}

function nextExercise() {
  if (lessonState.hearts <= 0) {
    completeLesson();
    return;
  }

  lessonState.currentIndex++;

  if (lessonState.currentIndex >= EXERCISES_PER_LESSON) {
    completeLesson();
  } else {
    renderExercise();
  }
}

function randomCorrectPhrase() {
  const phrases = [
    'Σωστά! Правильно!',
    'Μπράβο! Молодец!',
    'Τέλεια! Отлично!',
    'Ωραία! Прекрасно!',
    'Правильно!'
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

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
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Audio not available
  }
}

// ============================================================
// LESSON COMPLETE
// ============================================================
function completeLesson() {
  const today = new Date().toDateString();

  if (state.lastPlayed !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (state.lastPlayed === yesterday.toDateString()) {
      state.streak++;
    } else if (state.lastPlayed === null) {
      state.streak = 1;
    } else {
      state.streak = 1;
    }
    state.lastPlayed = today;
  }

  state.dailyXp += lessonState.xpEarned;
  state.totalXp += lessonState.xpEarned;
  state.level = Math.floor(state.totalXp / 500) + 1;
  saveState();

  const accuracy = Math.round((lessonState.correct / EXERCISES_PER_LESSON) * 100);

  let stars;
  if (lessonState.hearts === 3 && accuracy === 100) stars = '⭐⭐⭐';
  else if (lessonState.hearts >= 2 && accuracy >= 70) stars = '⭐⭐';
  else if (lessonState.hearts >= 1 && accuracy >= 40) stars = '⭐';
  else stars = '😅';

  document.getElementById('complete-stars').textContent = stars;
  document.getElementById('complete-xp').textContent = `+${lessonState.xpEarned} XP`;
  document.getElementById('complete-correct').textContent =
    `${lessonState.correct}/${EXERCISES_PER_LESSON}`;
  document.getElementById('complete-hearts').textContent = lessonState.hearts;
  document.getElementById('complete-streak').textContent = state.streak;

  const dailyDone = state.dailyXp >= state.dailyGoal;
  const goalMsg = document.getElementById('complete-goal-msg');
  if (dailyDone) {
    goalMsg.textContent = 'Цель дня выполнена! 🎯';
    goalMsg.style.display = 'block';
  } else {
    goalMsg.style.display = 'none';
  }

  showScreen('screen-complete');
}

// ============================================================
// VERB TABLE
// ============================================================
function showVerbTable() {
  const container = document.getElementById('verb-table-container');
  const pronounsRu = ['я', 'ты', 'он/она', 'мы', 'вы', 'они'];

  container.innerHTML = VERBS.map(verb => `
    <div class="verb-card">
      <div class="verb-title">
        <span class="verb-infinitive">${verb.infinitive}</span>
        <span class="verb-translation-badge">${verb.translation}</span>
      </div>
      ${verb.note ? `<div class="verb-note">${verb.note}</div>` : ''}
      <div class="verb-conjugation">
        ${PRONOUNS.map((p, i) => `
          <div class="conj-row">
            <span class="conj-pronoun">${pronounsRu[i]}</span>
            <span class="conj-form">${verb.present[p]}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  showScreen('screen-verbs');
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
