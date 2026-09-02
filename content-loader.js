/**
 * Удалённое обновление контента.
 *
 * Зачем: data.js вшит в бандл iOS-приложения, поэтому любое новое слово или
 * урок требовали новой сборки и ревью Apple. Загрузчик снимает это ограничение
 * — контент приезжает по сети, а Apple такое разрешает: ограничение 3.3.2
 * касается исполняемого кода, здесь же только данные (JSON.parse не способен
 * вернуть функцию).
 *
 * Как: две фазы.
 *   1. Синхронно, ДО app.js — подменяем разделы из localStorage. Никакой сети,
 *      никакой асинхронности: app.js на верхнем уровне считает VERBS_ONLY, ему
 *      нужны финальные данные сразу. Порядок <script> в index.html не меняется.
 *   2. Асинхронно, после старта — сверяем манифест, докачиваем ТОЛЬКО те
 *      разделы, чей хэш разошёлся, и складываем на будущее. Применится при
 *      следующем запуске: подменять контент под ногами у открытого экрана
 *      незачем.
 *
 * Бандл всегда выигрывает у кэша: если версия в data.js свежее сохранённой
 * (то есть юзер поставил обновление из App Store), кэш выбрасывается.
 *
 * Файлы на сервере генерирует tools/build-content.js.
 */
(function () {
  'use strict';

  var BASE = 'https://cabinet.izigreek.com';
  var LS_META = 'izi_content_meta';
  var LS_SECTION = 'izi_content_s_';

  // Ссылки на массивы из data.js. Они объявлены через const — переприсвоить
  // нельзя, поэтому меняем содержимое на месте. Заодно это сохраняет любые
  // ссылки, которые кто-то мог успеть взять.
  var TARGETS;
  try {
    TARGETS = {
      VERBS: VERBS,
      SCENARIOS: SCENARIOS,
      PLAN_30: PLAN_30,
      VOCAB_CATEGORIES: VOCAB_CATEGORIES,
      QUIZ_CATEGORIES: QUIZ_CATEGORIES,
      ACHIEVEMENTS: ACHIEVEMENTS,
      PHRASES: PHRASES
    };
  } catch (e) {
    // data.js не загрузился — обновлять нечего, приложение поедет как есть.
    console.warn('[content] data.js недоступен, удалённый контент отключён');
    return;
  }

  var KEYS = Object.keys(TARGETS);
  var BUNDLED_VERSION = (typeof CONTENT_VERSION === 'number') ? CONTENT_VERSION : 0;
  var BUNDLED_HASHES = (typeof CONTENT_SECTIONS === 'object' && CONTENT_SECTIONS) ? CONTENT_SECTIONS : {};

  // Размеры вшитых разделов — эталон для проверки вменяемости скачанного.
  var BUNDLED_COUNTS = {};
  KEYS.forEach(function (k) { BUNDLED_COUNTS[k] = TARGETS[k].length; });

  function readMeta() {
    try {
      var raw = localStorage.getItem(LS_META);
      var meta = raw ? JSON.parse(raw) : null;
      if (!meta || typeof meta.version !== 'number' || !meta.sections) return null;
      return meta;
    } catch (e) { return null; }
  }

  function dropCache(why) {
    try {
      localStorage.removeItem(LS_META);
      KEYS.forEach(function (k) { localStorage.removeItem(LS_SECTION + k); });
    } catch (e) { /* приватный режим — молча */ }
    if (why) console.log('[content] кэш сброшен: ' + why);
  }

  // Раздел считается битым, если это не массив, он пуст или внезапно похудел
  // больше чем вчетверо — так усечённая выгрузка не выкосит контент у всех.
  function isSane(key, value) {
    if (!Array.isArray(value) || value.length === 0) return false;
    var floor = Math.floor(BUNDLED_COUNTS[key] / 4);
    return value.length >= floor;
  }

  function replaceInPlace(target, next) {
    target.length = 0;
    for (var i = 0; i < next.length; i++) target.push(next[i]);
  }

  // ------------------------------------------------------------------
  // Фаза 1 — синхронно, до app.js
  // ------------------------------------------------------------------
  var meta = readMeta();

  if (meta && meta.version <= BUNDLED_VERSION) {
    // Пришло обновление из App Store — вшитый контент не старше кэша.
    dropCache('в бандле версия ' + BUNDLED_VERSION + ', в кэше ' + meta.version);
    meta = null;
  }

  var applied = [];
  if (meta) {
    KEYS.forEach(function (key) {
      if (!meta.sections[key] || meta.sections[key] === BUNDLED_HASHES[key]) return;
      try {
        var raw = localStorage.getItem(LS_SECTION + key);
        if (!raw) return;
        var value = JSON.parse(raw);
        if (!isSane(key, value)) { console.warn('[content] раздел ' + key + ' не прошёл проверку, оставляем вшитый'); return; }
        replaceInPlace(TARGETS[key], value);
        applied.push(key + ':' + value.length);
      } catch (e) {
        console.warn('[content] раздел ' + key + ' не читается', e);
      }
    });
  }

  // Версия устройства — это версия пака, даже если подменять ничего не пришлось
  // (например, после отката контент на сервере снова совпал с вшитым).
  var activeVersion = meta ? meta.version : BUNDLED_VERSION;
  console.log('[content] версия ' + activeVersion + (
    applied.length ? ' (обновлено: ' + applied.join(', ') + ')'
      : meta ? ' (разделы совпадают с вшитыми)' : ' (вшитая)'));

  // ------------------------------------------------------------------
  // Фаза 2 — асинхронно, после старта приложения
  // ------------------------------------------------------------------
  function currentHash(key) {
    return (meta && meta.sections[key]) || BUNDLED_HASHES[key];
  }

  function checkForUpdates() {
    if (navigator.onLine === false) return;

    fetch(BASE + '/content-version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (manifest) {
        if (!manifest || typeof manifest.version !== 'number' || !manifest.sections) throw new Error('битый манифест');
        if (manifest.version <= activeVersion) { console.log('[content] обновлений нет'); return; }

        var stale = KEYS.filter(function (k) {
          return manifest.sections[k] && manifest.sections[k] !== currentHash(k);
        });
        if (!stale.length) { console.log('[content] разделы уже актуальны'); return; }

        console.log('[content] качаем разделы: ' + stale.join(', '));
        return Promise.all(stale.map(function (key) {
          return fetch(BASE + '/content/' + key + '.json?v=' + manifest.sections[key])
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(key + ': HTTP ' + r.status)); })
            .then(function (value) {
              if (!isSane(key, value)) throw new Error(key + ': не прошёл проверку');
              return { key: key, value: value };
            });
        })).then(function (packs) {
          // Пишем только когда скачались ВСЕ разделы — иначе рискуем оставить
          // half-updated состояние с несогласованными между собой данными.
          var next = meta ? JSON.parse(JSON.stringify(meta.sections)) : {};
          packs.forEach(function (p) {
            localStorage.setItem(LS_SECTION + p.key, JSON.stringify(p.value));
            next[p.key] = manifest.sections[p.key];
          });
          localStorage.setItem(LS_META, JSON.stringify({ version: manifest.version, sections: next }));
          console.log('[content] версия ' + manifest.version + ' готова, применится при следующем запуске');
          window.__iziContentPending = manifest.version;
        });
      })
      .catch(function (err) {
        var quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || err)));
        if (quota) dropCache('не хватило места в localStorage');
        else console.warn('[content] обновление не удалось:', err && (err.message || err));
      });
  }

  // Не мешаем старту: Firebase, авторизация и первый рендер важнее.
  function schedule() { setTimeout(checkForUpdates, 4000); }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule);
})();
