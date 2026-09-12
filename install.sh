#!/usr/bin/env bash
# Установка скилла «Дашборд отдела маркетинга».
#   bash install.sh            → .claude/skills/marketing-dashboard (текущий проект, Claude Code)
#   bash install.sh --user     → ~/.claude/skills/marketing-dashboard (все проекты)
#   bash install.sh --codex    → .agents/marketing-dashboard + строка в AGENTS.md
set -euo pipefail

REPO="https://github.com/oxionezhkov-hub/cmo-dashboard-skill"
NAME="marketing-dashboard"
MODE="${1:---project}"

case "$MODE" in
  --user)    TARGET="$HOME/.claude/skills/$NAME" ;;
  --codex)   TARGET=".agents/$NAME" ;;
  --project|"") TARGET=".claude/skills/$NAME" ;;
  *) echo "Не знаю режим «$MODE». Доступны: --project (по умолчанию), --user, --codex"; exit 1 ;;
esac

if [ -e "$TARGET" ]; then
  echo "Папка $TARGET уже существует."
  echo "Обновить: rm -rf \"$TARGET\" и запустить установку снова."
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --quiet "$REPO" "$TARGET"
  rm -rf "$TARGET/.git"
else
  mkdir -p "$TARGET"
  curl -sL "$REPO/archive/refs/heads/main.tar.gz" | tar -xz --strip-components=1 -C "$TARGET"
fi

echo "Скилл установлен: $TARGET"

if [ "$MODE" = "--codex" ]; then
  LINE="Задачи про дашборд маркетинга, сквозную аналитику и ИИ-выводы по рекламе — работать по инструкции \`$TARGET/SKILL.md\`, начиная с вопросов из неё."
  if [ -f AGENTS.md ] && grep -qF "$TARGET/SKILL.md" AGENTS.md; then
    echo "AGENTS.md уже ссылается на скилл — ничего не меняю."
  else
    printf '\n## Дашборд отдела маркетинга\n\n%s\n' "$LINE" >> AGENTS.md
    echo "В AGENTS.md добавлена ссылка на скилл."
  fi
  echo
  echo "Дальше: попросите Codex «собери дашборд отдела маркетинга» — он прочитает SKILL.md и начнёт с вопросов."
else
  echo
  echo "Дальше: в Claude Code вызовите /$NAME или попросите словами «собери дашборд отдела маркетинга»."
fi

echo "Посмотреть шаблон прямо сейчас:"
echo "  cp -r \"$TARGET/assets/dashboard\" ./dashboard && cd dashboard/collectors && node collect.js && open ../index.html"
