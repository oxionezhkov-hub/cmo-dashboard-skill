# Фаза 2. Единая модель данных

Пять источников отдают пять разных форматов: TSV с отчётом, JSON с массивами метрик, события бота,
карточки сделок, строки таблицы. Дашборд читает одно: `dashboard/data/dashboard.json`.
Приведение делает `collectors/normalize.js`.

## Верхний уровень

```jsonc
{
  "meta":     { "company", "period", "comparePeriod", "generatedAt", "mode", "currency" },
  "sources":  [ { "name", "status": "ok|error|off|demo", "rows", "ms", "note" } ],
  "kpi":      [ { "id", "label", "value", "prev", "delta", "good", "unit", "plan", "planDone", "spark", "source" } ],
  "daily":    [ { "date", "spend", "clicks", "impressions", "visits", "leads", "qualified", "deals", "revenue", "cpl" } ],
  "channels": [ { "name", "spend", "leads", "cpl", "cplDelta", "qualRate", "romi", "paid" } ],
  "campaigns":[ { "name", "channel", "spend", "clicks", "ctr", "cpc", "leads", "cpl", "cplDelta", "qualRate", "deals", "revenue", "romi" } ],
  "funnel":   [ { "stage", "value", "source" } ],
  "metrika":  { "sources": [ { "source", "visits", "bounceRate", "pageDepth", "leads", "cr" } ], "visits" },
  "telegram": { "joined", "started", "quizCompleted", "bookedCall", "quizRate", "daily", "funnel" },
  "amo":      { "pipeline", "managers", "lostReasons", "avgCycle", "avgCheck" },
  "sheets":   { "costs", "extraCosts", "planFact" },
  "channelsDaily": [ { "date", "channel", "impressions", "clicks", "spend", "leads", "qualified", "deals", "revenue" } ],
  "campaignsDaily":[ { "date", "campaign", "impressions", "clicks", "spend", "leads", "qualified", "deals", "revenue" } ],
  "pages":    [ { "url", "title", "visits", "avgTime", "scrollRate", "readRate", "ctaRate", "formRate", "submitRate", "rageRate" } ],
  "calls":    { "total", "answered", "missed", "missedRate", "target", "targetRate", "avgWait", "avgTalk", "byHour", "byWeekday", "byChannel" },
  "insights": [ { "id", "severity", "title", "summary", "evidence", "action", "impact", "sources" } ],
  "digest":   "текст для Telegram",
  "totals":   { "spend", "leads", "qualified", "deals", "revenue" }
}
```

## Контракт коннекторов

Каждый коннектор возвращает плоские строки, а не готовые агрегаты. Агрегирует только `normalize.js` —
иначе одна и та же цифра считается в трёх местах по-разному.

| Коннектор | Возвращает |
|---|---|
| `yandex_direct` | `[{date, campaignId, campaign, impressions, clicks, spend}]` |
| `yandex_metrika` | `[{date, source, visits, bounceRate, pageDepth, goalLeads}]` |
| `telegram_bot` | `{daily: [{date, joined, left, started, quizCompleted, bookedCall}], subscribers}` |
| `amocrm` | `[{id, createdAt, channel, campaign, manager, qualified, status, amount, cycleDays, lostReason}]` |
| `google_sheets` | `{plan: [{month, metric, plan}], costs: [{month, channel, spend}]}` |
| `vk_ads` | те же строки, что у Директа: `[{date, campaignId, campaign, impressions, clicks, spend}]` |
| `telegram_ads` | то же, но источник — лист выгрузки из кабинета |
| `calltouch` | `[{date, hour, channel, answered, durationSec, target, waitSec}]` |
| `yandex_metrika.fetchPageActivity` | `[{url, title, visits, avgTimeSec, scroll50, scroll75, scroll100, ctaClicks, formStarts, formSubmits, rageClicks}]` |

Добавить свой источник = написать файл с такой же подписью `fetch*(config, period)` и дописать строку
в `collectLive()` внутри `collect.js`. Ни модель, ни дашборд при этом не меняются.

## Разрезы по дням

`channelsDaily` и `campaignsDaily` — это те же каналы и кампании, но с датой. Они нужны, чтобы дашборд
умел менять период сам, без пересборки: переключатель «7 / 14 / 28 дней» пересчитывает KPI, динамику,
каналы, кампании и воронку бота прямо в браузере. Блоки без дневной разбивки (поведение на страницах,
звонки, продажи по менеджерам) всегда показывают весь период и честно подписаны об этом.

## Где данные склеиваются

- **Канал.** Заявка знает свой канал из CRM (`channel`), расход знает свою кампанию из Директа.
  Склейка идёт по названию кампании: `channelOfCampaign()`. Если в CRM нет поля с кампанией —
  сквозной срез по кампаниям не построить, можно только по каналу.
- **Период сравнения.** Считается автоматически: предыдущий отрезок такой же длины. Все `delta` — к нему.
- **Расходы вне кабинетов** приходят из таблицы и попадают в `totals.spend`, но не в `campaigns`.
  Поэтому средний CPL по кампаниям и общий CPL различаются — это нормально, но в подписи к блоку это сказано.

## Проверка модели перед тем, как рисовать

```bash
node collect.js --mode=live --from=2026-08-01 --to=2026-08-31
node -e "const d=require('../data/dashboard.json');console.log(d.totals)"
```

Сверить: `totals.spend` с расходом в Директе за тот же месяц (с учётом НДС),
`totals.deals` и `revenue` — с воронкой amoCRM. Расхождение больше 2% — баг, а не округление.
