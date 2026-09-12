// amoCRM — API v4 (https://www.amocrm.ru/developers/content/crm_platform/leads-api).
// Токен: долгоживущий токен интеграции. Поля квалификации/канала настраиваются в config.
import { request } from './lib/http.js';

export async function fetchAmo(cfg, period) {
  const { subdomain, token, fieldMap = {}, wonStatusName = 'Успешно реализовано', lostStatusName = 'Закрыто и не реализовано' } = cfg;
  const base = `https://${subdomain}.amocrm.ru/api/v4`;
  const headers = { Authorization: `Bearer ${token}` };

  const [pipelines, users] = await Promise.all([
    request(`${base}/leads/pipelines`, { headers }).then((r) => r.data),
    request(`${base}/users?limit=250`, { headers }).then((r) => r.data),
  ]);
  const statusNames = new Map();
  for (const p of pipelines?._embedded?.pipelines || []) {
    for (const s of p._embedded?.statuses || []) statusNames.set(s.id, s.name);
  }
  const userNames = new Map((users?._embedded?.users || []).map((u) => [u.id, u.name]));

  const from = Math.floor(new Date(`${period.from}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${period.to}T23:59:59`).getTime() / 1000);

  const leads = [];
  for (let page = 1; page <= 200; page++) {
    const url = `${base}/leads?limit=250&page=${page}&with=contacts&filter[created_at][from]=${from}&filter[created_at][to]=${to}`;
    const res = await request(url, { headers });
    if (res.status === 204 || !res.data?._embedded?.leads?.length) break;
    leads.push(...res.data._embedded.leads);
    if (!res.data._links?.next) break;
  }

  return leads.map((l) => {
    const cf = Object.fromEntries((l.custom_fields_values || []).map((f) => [f.field_id, f.values?.[0]?.value]));
    const status = statusNames.get(l.status_id) || String(l.status_id);
    return {
      id: `L-${l.id}`,
      createdAt: new Date(l.created_at * 1000).toISOString().slice(0, 19),
      channel: cf[fieldMap.channel] || l._embedded?.tags?.[0]?.name || 'Прочее',
      campaign: cf[fieldMap.campaign] || '—',
      manager: userNames.get(l.responsible_user_id) || 'Без ответственного',
      qualified: fieldMap.qualified ? Boolean(cf[fieldMap.qualified]) : status !== lostStatusName,
      status,
      amount: status === wonStatusName ? Number(l.price || 0) : 0,
      cycleDays: l.closed_at ? Math.max(0, (l.closed_at - l.created_at) / 86400) : null,
      lostReason: status === lostStatusName ? (cf[fieldMap.lostReason] || 'Не указана') : null,
    };
  });
}
