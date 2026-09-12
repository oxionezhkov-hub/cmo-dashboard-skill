// Telegram Ads. Публичного API статистики у кабинета нет, поэтому рабочих варианта два:
//   1) выгрузка из кабинета в Google-таблицу (лист «Telegram Ads»: дата, кампания, показы, клики, расход);
//   2) данные реселлера, если закупка идёт через агентство с API.
// Коннектор читает первый вариант — тот же Sheets API, но отдаёт строки в формате рекламных кабинетов.
import { request } from './lib/http.js';

export async function fetchTelegramAds({ spreadsheetId, apiKey, accessToken, range = 'Telegram Ads!A1:E500' }, period) {
  const auth = accessToken ? '' : `?key=${apiKey}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${auth}`;
  const res = await request(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  const rows = res.data?.values || [];
  const body = /дата|date/i.test(String(rows[0]?.[0])) ? rows.slice(1) : rows;

  return body
    .filter((r) => r[0] >= period.from && r[0] <= period.to)
    .map((r) => ({
      date: r[0],
      campaignId: null,
      campaign: r[1] || 'Telegram Ads',
      impressions: num(r[2]),
      clicks: num(r[3]),
      spend: num(r[4]),
    }));
}

const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
