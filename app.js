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
  errorLog: {}
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

const PRONOUNS = ["εγώ", "εσύ", "αυτός/ή/ό", "εμείς", "εσείς", "αυτοί/ές/ά"];
const PRONOUNS_RU = {
  "εγώ": "я", "εσύ": "ты", "αυτός/ή/ό": "он/она/оно",
  "εμείς": "мы", "εσείς": "вы", "αυτοί/ές/ά": "они"
};

// ============================================================
// PERSISTENCE
// ============================================================
function loadState() {
  try {
    const saved = localStorage.getItem('greek-app-state-v2');
    if (saved) state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
  } catch (e) { state = { ...DEFAULT_STATE }; }
}

function saveState() {
  localStorage.setItem('greek-app-state-v2', JSON.stringify(state));
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadState();
  checkStreak();
  renderHome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
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
}

function showHome() {
  showScreen('screen-home');
  renderHome();
}

// ============================================================
// LESSON — EXERCISE GENERATION
// ============================================================
function generateLesson() {
  const exercises = [];
  for (let i = 0; i < EXERCISES_PER_LESSON; i++) {
    const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
    const type = Math.floor(Math.random() * 4);
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
        type: 'phrase_meaning',
        greek: `${pronoun} ${form}`,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongMeanings(verb, pronoun)])
      });
    } else if (type === 2) {
      const correct = verb.translation;
      const wrongs = VERBS.filter(v => v.id !== verb.id).sort(() => Math.random() - 0.5).slice(0, 3).map(v => v.translation);
      exercises.push({
        type: 'word_meaning', greek: verb.infinitive,
        correctAnswer: correct, options: shuffle([correct, ...wrongs])
      });
    } else {
      const correct = verb.present[pronoun];
      exercises.push({
        type: 'translate_to_greek',
        russian: `${PRONOUNS_RU[pronoun]} ${verb.translation}`,
        verb, pronoun,
        correctAnswer: correct,
        options: shuffle([correct, ...getWrongForms(verb, correct)])
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
  lessonState = { exercises: generateLesson(), currentIndex: 0, hearts: 3, xpEarned: 0, correct: 0, answered: false };
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
  } else {
    label.textContent = 'Переведи на греческий';
    question.textContent = ex.russian;
    subtitle.textContent = `${ex.verb.infinitive}  —  ${ex.verb.translation}`;
  }

  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  ex.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => selectAnswer(opt, ex.correctAnswer, ex.verb?.id));
    grid.appendChild(btn);
  });
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
  saveState();

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
      <div class="dialogue-greek">${step.greek}</div>
      <div class="dialogue-transcription">🔊 ${step.transcription}</div>
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
function showVerbTable() {
  const pronounsRu = ['я', 'ты', 'он/она', 'мы', 'вы', 'они'];
  const container = document.getElementById('verb-table-container');

  container.innerHTML = VERBS.map(verb => `
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
        <span class="example-greek">${verb.example.greek}</span>
        <span class="example-ru">${verb.example.ru}</span>
      </div>
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
        <div class="audit-stat-value">${state.scenariosCompleted.length}/4</div>
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
  if (state.scenariosCompleted.length < 4) return `Пройдено ${state.scenariosCompleted.length}/4 сценариев. Сценарий "Собеседование на гражданство" — самый важный. Пройди его!`;
  return 'Отлично! Все сценарии пройдены. Следующий шаг — говорить с носителями. Найди грека и практикуй!';
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

async function fetchNewsForQuery(query, topicId) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=el&gl=GR&ceid=GR:el`;
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=20`;
  const res = await fetch(apiUrl);
  const data = await res.json();
  return (data.items || []).map(item => ({ ...item, _topicId: topicId }));
}

async function fetchAllNews() {
  const rssUrl = `https://news.google.com/rss?hl=el&gl=GR&ceid=GR:el`;
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=30`;
  const res = await fetch(apiUrl);
  const data = await res.json();
  return data.items || [];
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
});
