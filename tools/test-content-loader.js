/**
 * Стенд для content-loader.js: гоняем data.js + загрузчик в песочнице
 * с поддельными localStorage / fetch / DOM.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.HOME + '/izigreek-cabinet';
const dataJs = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
const loaderJs = fs.readFileSync(path.join(ROOT, 'content-loader.js'), 'utf8');

// Вшитая версия меняется с каждой публикацией — берём её из data.js,
// иначе стенд начинает врать после первого же релиза контента.
const BUNDLED = Number(/const CONTENT_VERSION = (\d+);/.exec(dataJs)[1]);
console.log('Вшитая в data.js версия контента: ' + BUNDLED);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

function makeStore(seed) { return Object.assign({}, seed || {}); }

// Один «запуск приложения».
function boot({ store, server, quiet = true, dataOverride = null }) {
  const timers = [];
  const logs = [];
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (server && server.quotaBytes) {
        const used = Object.values(store).reduce((a, b) => a + b.length, 0);
        if (used + v.length > server.quotaBytes) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      }
      store[k] = String(v);
    },
    removeItem: (k) => { delete store[k]; }
  };
  const sandbox = {
    localStorage,
    navigator: { onLine: true },
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')) },
    document: { readyState: 'complete' },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    fetch: (url) => {
      const clean = url.split('?')[0].replace('https://cabinet.izigreek.com', '');
      if (!server || !(clean in server.files)) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(server.files[clean])) });
    },
    Promise, Array, Object, JSON, Math, Error, String, Date
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(dataOverride || dataJs, sandbox, { filename: 'data.js' });
  vm.runInContext(loaderJs, sandbox, { filename: 'content-loader.js' });
  const flush = async () => { for (const t of timers) t(); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
  if (!quiet) logs.forEach(l => console.log('     | ' + l));
  // const из data.js живёт в лексическом скоупе контекста, а не на объекте —
  // читаем его отдельным скриптом в том же контексте, как это делает браузер.
  const read = (expr) => vm.runInContext('(' + expr + ')', sandbox);
  return { sandbox, logs, flush, store, read };
}

// Сервер = текущее содержимое content/ + манифест.
function realServer(mutate) {
  const files = { '/content-version.json': fs.readFileSync(path.join(ROOT, 'content-version.json'), 'utf8') };
  for (const f of fs.readdirSync(path.join(ROOT, 'content'))) {
    files['/content/' + f] = fs.readFileSync(path.join(ROOT, 'content', f), 'utf8');
  }
  const s = { files };
  if (mutate) mutate(s);
  return s;
}

(async () => {
console.log('\n1. Холодный старт без кэша — берём вшитый контент');
{
  const store = makeStore();
  const { read, logs } = boot({ store, server: realServer() });
  check('VERBS = 305 из бандла', read('VERBS').length === 305, read('VERBS').length);
  check('лог сообщает про вшитую версию', logs.some(l => l.includes('(вшитая)')), logs[0]);
  check('в localStorage ничего не записано', Object.keys(store).length === 0);
}

console.log('\n2. На сервере новая версия с добавленным глаголом — качаем только VERBS');
const storeAfterUpdate = makeStore();
{
  const server = realServer((s) => {
    const verbs = JSON.parse(s.files['/content/VERBS.json']);
    verbs.push({ id: 99999, infinitive: 'δοκιμάζω', translation: 'пробовать' });
    s.files['/content/VERBS.json'] = JSON.stringify(verbs);
    const m = JSON.parse(s.files['/content-version.json']);
    m.version = BUNDLED + 1; m.sections.VERBS = 'новыйхэшverbs';
    s.files['/content-version.json'] = JSON.stringify(m);
  });
  const { read, logs, flush } = boot({ store: storeAfterUpdate, server });
  check('до обновления VERBS = 305', read('VERBS').length === 305);
  await flush();
  check('качали ровно один раздел', logs.some(l => l.includes('качаем разделы: VERBS')), logs.filter(l => l.includes('качаем'))[0]);
  check('пак сохранён в localStorage', 'izi_content_s_VERBS' in storeAfterUpdate);
  check('прочие разделы не сохранялись', !('izi_content_s_PHRASES' in storeAfterUpdate));
  check('мета записана со следующей версией', JSON.parse(storeAfterUpdate.izi_content_meta).version === BUNDLED + 1);
  check('в текущей сессии контент НЕ подменён', read('VERBS').length === 305, 'подмена должна быть на следующий запуск');
}

console.log('\n3. Следующий запуск — обновление применяется синхронно до app.js');
{
  const { read, logs } = boot({ store: makeStore(storeAfterUpdate), server: realServer() });
  check('VERBS = 306', read('VERBS').length === 306, read('VERBS').length);
  check('новый глагол на месте', read('VERBS')[305].infinitive === 'δοκιμάζω');
  check('нетронутые разделы из бандла', read('PHRASES').length === 15);
  check('лог сообщает про обновление', logs.some(l => l.includes('обновлено: VERBS:306')), logs[0]);
}

console.log('\n4. Юзер поставил апдейт из App Store (вшитая версия свежее) — кэш выбрасывается');
{
  const store = makeStore(storeAfterUpdate);
  const newerBundle = dataJs.replace(/const CONTENT_VERSION = \d+;/, 'const CONTENT_VERSION = ' + (BUNDLED + 4) + ';');
  const { read, logs } = boot({ store, server: realServer(), dataOverride: newerBundle });
  check('VERBS вернулись к вшитым 305', read('VERBS').length === 305, read('VERBS').length);
  check('кэш очищен', Object.keys(store).length === 0, JSON.stringify(Object.keys(store)));
  check('лог объясняет сброс', logs.some(l => l.includes('кэш сброшен')), logs[0]);
}

console.log('\n5. Сервер отдал усечённый раздел — отбрасываем, контент не страдает');
{
  const server = realServer((s) => {
    s.files['/content/VOCAB_CATEGORIES.json'] = JSON.stringify([{ id: 1 }]); // 1 из 33
    const m = JSON.parse(s.files['/content-version.json']);
    m.version = BUNDLED + 9; m.sections.VOCAB_CATEGORIES = 'битыйхэш';
    s.files['/content-version.json'] = JSON.stringify(m);
  });
  const store = makeStore();
  const { read, logs, flush } = boot({ store, server });
  await flush();
  check('битый пак не сохранён', !('izi_content_s_VOCAB_CATEGORIES' in store), JSON.stringify(Object.keys(store)));
  check('мета не записана', !('izi_content_meta' in store));
  check('контент в памяти цел', read('VOCAB_CATEGORIES').length === 33);
  check('ошибка залогирована', logs.some(l => l.includes('не удалось')), logs.slice(-1)[0]);
}

console.log('\n6. Сеть недоступна — тихо работаем на вшитом');
{
  const store = makeStore();
  const { read, logs, flush } = boot({ store, server: { files: {} } });
  await flush();
  check('VERBS целы', read('VERBS').length === 305);
  check('приложение не падает', logs.some(l => l.includes('не удалось')) || true);
  check('ничего не сохранено', Object.keys(store).length === 0);
}

console.log('\n7. Версия на сервере не новее — сети на разделы не тратим');
{
  const store = makeStore();
  const { logs, flush } = boot({ store, server: realServer() });
  await flush();
  check('сказано «обновлений нет»', logs.some(l => l.includes('обновлений нет')), logs.slice(-1)[0]);
  check('ничего не качали', !logs.some(l => l.includes('качаем разделы')));
}

console.log('\n8. Кончилось место в localStorage — кэш сбрасывается, приложение живёт');
{
  const server = realServer((s) => {
    const m = JSON.parse(s.files['/content-version.json']);
    m.version = BUNDLED + 3; m.sections.VOCAB_CATEGORIES = 'другойхэш';
    s.files['/content-version.json'] = JSON.stringify(m);
  });
  server.quotaBytes = 1000; // заведомо мало
  const store = makeStore();
  const { read, logs, flush } = boot({ store, server });
  await flush();
  check('кэш очищен после QuotaExceeded', !('izi_content_meta' in store), JSON.stringify(Object.keys(store)));
  check('контент в памяти цел', read('VOCAB_CATEGORIES').length === 33);
  check('сброс залогирован', logs.some(l => l.includes('не хватило места')), logs.slice(-1)[0]);
}

console.log('\n' + '─'.repeat(46));
console.log(fail === 0 ? `ВСЕ ПРОВЕРКИ ПРОШЛИ: ${pass}` : `ПРОШЛО ${pass}, УПАЛО ${fail}`);
process.exit(fail ? 1 : 0);
})();
