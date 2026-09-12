// VK Ads — API статистики (https://ads.vk.com/doc/api).
// Токен: access_token приложения VK Ads с правом чтения статистики.
import { request } from './lib/http.js';

const BASE = 'https://ads.vk.com/api/v2';

export async function fetchVkAds({ token }, period) {
  const headers = { Authorization: `Bearer ${token}` };

  // Названия кампаний приходят отдельным справочником — статистика знает только id.
  const list = await request(`${BASE}/campaigns.json?limit=250&fields=id,name`, { headers });
  const names = new Map((list.data?.items || []).map((c) => [c.id, c.name]));

  const url = `${BASE}/statistics/campaigns/day.json?date_from=${period.from}&date_to=${period.to}&limit=250`;
  const res = await request(url, { headers });

  const rows = [];
  for (const item of res.data?.items || []) {
    for (const day of item.rows || []) {
      const b = day.base || day;
      rows.push({
        date: day.date,
        campaignId: item.id,
        campaign: names.get(item.id) || `VK Ads / ${item.id}`,
        impressions: Number(b.shows || 0),
        clicks: Number(b.clicks || 0),
        spend: Number(b.spent || 0),
      });
    }
  }
  return rows;
}
