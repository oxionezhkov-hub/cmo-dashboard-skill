// Google Sheets — план и офлайн-расходы, которых нет ни в одном рекламном кабинете.
// Вариант A (проще всего для воркшопа): таблица «по ссылке» + API-ключ.
// Вариант B: сервисный аккаунт, тогда в config кладём готовый access token.
import { request } from './lib/http.js';

export async function fetchSheets({ spreadsheetId, apiKey, accessToken, ranges = {} }, period) {
  const get = async (range) => {
    if (!range) return [];
    const auth = accessToken ? '' : `?key=${apiKey}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${auth}`;
    const res = await request(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    return res.data?.values || [];
  };

  const [planRows, costRows] = await Promise.all([get(ranges.plan), get(ranges.costs)]);
  const month = period.to.slice(0, 7);
  return {
    plan: rowsToObjects(planRows, ['metric', 'plan']).map((r) => ({ month, metric: r.metric, plan: num(r.plan) })),
    costs: rowsToObjects(costRows, ['channel', 'spend']).map((r) => ({ month, channel: r.channel, spend: num(r.spend) })),
  };
}

/** Первая строка — заголовки; если их нет, используем позиционные ключи. */
function rowsToObjects(rows, fallbackKeys) {
  if (!rows.length) return [];
  const [head, ...rest] = rows;
  const looksLikeHeader = head.some((c) => /план|метрика|канал|metric|plan|channel/i.test(String(c)));
  const keys = looksLikeHeader ? fallbackKeys : fallbackKeys;
  const body = looksLikeHeader ? rest : rows;
  return body.filter((r) => r.length).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
