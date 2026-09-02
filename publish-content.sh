#!/usr/bin/env bash
# Публикация контента в установленные приложения — без сборки и без ревью Apple.
#
#   1. правим data.js
#   2. ./publish-content.sh
#   3. через несколько минут новый контент у всех, у кого стоит приложение
#
# Скрипт пересобирает content/*.json, коммитит их в текущую ветку и отдельно
# выкладывает на main — GitHub Pages отдаёт именно её.
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || echo "Рабочая ветка: $BRANCH (main получит только данные)"

# Посторонние правки не тащим в коммит — пусть автор сам решит, что с ними делать.
DIRTY="$(git status --porcelain -- . ':(exclude)content' ':(exclude)content-version.json' ':(exclude)data.js')"
if [ -n "$DIRTY" ]; then
  echo "✗ В рабочей копии есть незакоммиченные правки помимо контента:"
  echo "$DIRTY"
  echo "  Закоммить или отложи их и запусти снова."
  exit 1
fi

echo "→ Собираем контент"
node tools/build-content.js

VERSION="$(node -e "console.log(require('./content-version.json').version)")"

if git diff --quiet -- content content-version.json data.js; then
  echo "= Контент не менялся, публиковать нечего (версия $VERSION)"
  exit 0
fi

echo "→ Коммитим в $BRANCH"
git add content content-version.json data.js
git commit -q -m "Контент версии $VERSION"
git push -q origin "$BRANCH"

if [ "$BRANCH" != "main" ]; then
  echo "→ Выкладываем данные на main"
  TMP="$(mktemp -d)"
  cp -R content "$TMP/"
  cp content-version.json "$TMP/"
  git checkout -q main
  git pull -q origin main
  rm -rf content
  cp -R "$TMP/content" .
  cp "$TMP/content-version.json" .
  git add content content-version.json
  git commit -q -m "Контент версии $VERSION"
  git push -q origin main
  git checkout -q "$BRANCH"
  rm -rf "$TMP"
fi

echo "→ Ждём GitHub Pages"
for i in $(seq 1 30); do
  LIVE="$(curl -s "https://cabinet.izigreek.com/content-version.json?t=$(date +%s)" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch(e){console.log(0)}})" || echo 0)"
  if [ "$LIVE" = "$VERSION" ]; then
    echo "✓ Версия $VERSION в проде. Приложения подхватят её при следующем запуске."
    exit 0
  fi
  printf '.'
  sleep 10
done
echo
echo "⚠ Pages ещё не обновился (в проде версия $LIVE, ждём $VERSION). Обычно доезжает за пару минут."
