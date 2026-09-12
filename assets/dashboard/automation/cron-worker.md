# Вариант без GitHub Actions: обновление на Cloudflare Worker

Если дашборд уже живёт на воркере (как в этом репозитории), сборку можно повесить на cron-триггер воркера:

```toml
# wrangler.toml
[triggers]
crons = ["0 5 * * *"]   # 08:00 МСК
```

```js
export default {
  async scheduled(event, env, ctx) {
    const data = await buildDashboard(env);          // тот же пайплайн, что в collectors/
    await env.DASHBOARD_KV.put('dashboard:latest', JSON.stringify(data));
    if (data.insights.some((i) => i.severity === 'critical')) {
      await sendDigest(env, data.digest);            // Telegram-уведомление руководителю
    }
  },
};
```

Коллекторы написаны на чистом `fetch` без зависимостей от Node API, поэтому переносятся в Worker
почти без правок: меняется только чтение конфига (`env` вместо `config.json`) и запись результата
(KV вместо файла). Дашборд в этом варианте забирает данные не из `data/dashboard.js`,
а из эндпоинта воркера — замените последний `<script src="data/dashboard.js">` на

```html
<script>
  window.DASHBOARD_DATA = await (await fetch('/api/dashboard')).json();
</script>
```

Про частоту: раз в сутки достаточно для отчётности; раз в час имеет смысл только если
на дашборд смотрят в течение дня и данные в источниках обновляются так же часто.
