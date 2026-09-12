# Где взять каждый секрет и куда его вставить

Один источник за раз: получили → проверили → включили. Все значения кладутся в переменные окружения,
а в `dashboard/collectors/config.json` остаётся только ссылка вида `"env:ИМЯ"`. Сам `config.json`
в `.gitignore` — в репозиторий не попадает.

| Что нужно | Где взять | Имя переменной | Куда попадает в конфиге |
|---|---|---|---|
| OAuth-токен Яндекса (Директ) | oauth.yandex.ru → создать приложение с правом «Яндекс.Директ» → получить токен | `DIRECT_TOKEN` | `sources.direct.token` |
| Логин клиента (для агентств) | логин рекламного аккаунта в Директе | — | `sources.direct.clientLogin` |
| OAuth-токен Яндекса (Метрика) | то же приложение, добавить право «Яндекс.Метрика» | `METRIKA_TOKEN` | `sources.metrika.token` |
| Номер счётчика | Метрика → Настройка → Номер счётчика | — | `sources.metrika.counterId` |
| id цели «Заявка» | Метрика → Настройка → Цели → id в адресной строке | — | `sources.metrika.goalId` |
| id целей прокрутки и формы | там же, цели «доскролл 50/75/100%», «клик по CTA», «начал форму», «отправил форму» | — | `sources.metrika.pageGoals` |
| Токен VK Ads | ads.vk.com → Настройки → Доступ по API → создать приложение | `VK_ADS_TOKEN` | `sources.vk.token` |
| Выгрузка Telegram Ads | кабинет Telegram Ads → экспорт статистики в лист «Telegram Ads» вашей таблицы | — | `sources.telegramAds.range` |
| Токен интеграции amoCRM | amoCRM → Интеграции → Создать интеграцию → «Ключи и доступы» → долгосрочный токен | `AMO_TOKEN` | `sources.amo.token` |
| Поддомен amoCRM | часть адреса до `.amocrm.ru` | — | `sources.amo.subdomain` |
| id кастомных полей amoCRM | `GET /api/v4/leads/custom_fields` этим же токеном | — | `sources.amo.fieldMap` |
| Токен Telegram-бота | @BotFather → /mybots → API Token | `BOT_TOKEN` | `sources.telegram.botToken` |
| Эндпоинт событий бота | ваш бот: отдать события воронки по датам (см. `connectors.md`) | `BOT_EVENTS_SECRET` | `sources.telegram.eventsUrl` |
| Ключ Calltouch | Calltouch → Настройки → Интеграции → API | `CALLTOUCH_TOKEN` | `sources.calls.token` |
| id сайта в Calltouch | адресная строка кабинета | — | `sources.calls.siteId` |
| Ключ Google Sheets | console.cloud.google.com → включить Sheets API → создать API-ключ, таблицу открыть «по ссылке» | `SHEETS_API_KEY` | `sources.sheets.apiKey` |
| id таблицы | часть адреса между `/d/` и `/edit` | — | `sources.sheets.spreadsheetId` |
| Ключ Claude | console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` (в воркере — `CLAUDE_API`) | берётся из окружения |
| Токен бота для дайджеста | отдельный бот у @BotFather | `NOTIFY_BOT_TOKEN` | `notify.botToken` |
| chat_id получателя | написать боту и открыть `https://api.telegram.org/bot<токен>/getUpdates` | `NOTIFY_CHAT_ID` | `notify.chatId` |

## Как передавать секреты

- **Локально:** `.env`-подход не нужен, достаточно строки перед командой:
  `DIRECT_TOKEN=... AMO_TOKEN=... node collect.js --mode=live`
- **GitHub Actions:** Settings → Secrets and variables → Actions, имена те же.
- **Cloudflare Worker:** `wrangler secret put CLAUDE_API` и остальные — по одному.

Чего не делаем никогда: не просим клиента прислать токен в чат «одной строкой», не пишем токены
в конфиг, не коммитим `config.json`, не выводим значения в лог. Если токен всё же засветился —
отзываем и выпускаем новый, это дешевле любых объяснений.

## Если доступа нет прямо сейчас

Отключите источник в `config.json` (`"enabled": false`) и соберите дашборд без него: остальные
блоки посчитаются, а в разделе «Откуда берутся данные» будет видно, чего не хватает.
Это нормальный промежуточный результат — лучше, чем ждать неделю ради полного набора.
