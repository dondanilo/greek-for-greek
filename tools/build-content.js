#!/usr/bin/env node
/**
 * Собирает удалённый контент-пак из data.js.
 *
 * data.js остаётся источником правды и продолжает лежать в бандле приложения
 * как офлайн-фолбэк. Скрипт режет его на разделы, кладёт каждый отдельным
 * JSON-файлом и штампует в data.js версию + хэши разделов. Приложение при
 * старте подменяет только те разделы, чей хэш на сервере отличается от вшитого,
 * — так новый контент доезжает до iOS без сборки и без ревью Apple.
 *
 * Запуск: node tools/build-content.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_JS = path.join(ROOT, 'data.js');
const OUT_DIR = path.join(ROOT, 'content');
const MANIFEST = path.join(ROOT, 'content-version.json');

// Разделы, которые умеют обновляться удалённо. Порядок = порядок в data.js.
const KEYS = ['VERBS', 'SCENARIOS', 'PLAN_30', 'VOCAB_CATEGORIES', 'QUIZ_CATEGORIES', 'ACHIEVEMENTS', 'PHRASES'];

const raw = fs.readFileSync(DATA_JS, 'utf8');
// Снимаем штамп предыдущей сборки, чтобы хэши считались от чистого контента.
const src = raw.replace(/^\/\/ --- сборка контента[\s\S]*?\/\/ --- \/сборка контента ---\n/, '');

// data.js объявляет всё через const на верхнем уровне скрипта: значения не
// попадают в объект песочницы, поэтому дописываем сборщик в тот же скоуп.
const sandbox = { __out: null };
vm.createContext(sandbox);
vm.runInContext(src + `\n;__out = { ${KEYS.join(', ')} };`, sandbox, { filename: 'data.js' });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

fs.mkdirSync(OUT_DIR, { recursive: true });

const hashes = {};
const counts = {};
const sizes = {};
for (const key of KEYS) {
  const value = sandbox.__out[key];
  if (!Array.isArray(value) || value.length === 0) {
    console.error(`✗ ${key}: ожидался непустой массив, получено ${Object.prototype.toString.call(value)}`);
    process.exit(1);
  }
  const body = JSON.stringify(value);
  hashes[key] = sha(body);
  counts[key] = value.length;
  sizes[key] = Buffer.byteLength(body);
  fs.writeFileSync(path.join(OUT_DIR, key + '.json'), body);
}

// Версия монотонно растёт и только при реальном изменении контента, иначе
// приложения будут перекачивать разделы на каждый деплой сайта.
let version = 1;
let previous = null;
if (fs.existsSync(MANIFEST)) {
  try { previous = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {
    console.warn('⚠ предыдущий манифест не читается, версия начинается заново');
  }
}
const changed = KEYS.filter((k) => !previous || previous.sections?.[k] !== hashes[k]);
if (previous) version = changed.length ? previous.version + 1 : previous.version;

fs.writeFileSync(MANIFEST, JSON.stringify({
  version,
  generatedAt: new Date().toISOString(),
  sections: hashes,
  counts
}, null, 2) + '\n');

// Штамп в data.js: вшитая версия и хэши. Удалённый раздел применяется только
// если версия строго новее вшитой, поэтому свежая сборка из App Store никогда
// не откатывается на протухший кэш.
const stamp = [
  '// --- сборка контента: генерируется tools/build-content.js, руками не править ---',
  `const CONTENT_VERSION = ${version};`,
  `const CONTENT_SECTIONS = ${JSON.stringify(hashes)};`,
  '// --- /сборка контента ---',
  ''
].join('\n');
fs.writeFileSync(DATA_JS, stamp + src);

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + ' КБ';
console.log(changed.length
  ? `↑ Изменились разделы: ${changed.join(', ')} → версия ${previous ? previous.version : 0} → ${version}`
  : `= Контент не изменился, версия остаётся ${version}`);
console.log('\n  Раздел              Записей     Размер   Хэш');
for (const key of KEYS) {
  const mark = changed.includes(key) ? '*' : ' ';
  console.log(`${mark} ${key.padEnd(18)} ${String(counts[key]).padStart(5)}  ${kb(sizes[key])}   ${hashes[key]}`);
}
console.log(`\n  Итого ${kb(Object.values(sizes).reduce((a, b) => a + b, 0))} в content/, манифест ${fs.statSync(MANIFEST).size} Б`);
