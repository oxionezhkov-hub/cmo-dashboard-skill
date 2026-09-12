// Коллтрекинг Calltouch — журнал звонков (https://www.calltouch.ru/support/api-calltouch/).
// Токен: API-ключ личного кабинета, siteId — идентификатор сайта.
// У Roistat/CoMagic формат ответа другой, но контракт коннектора тот же: плоский список звонков.
import { request } from './lib/http.js';

export async function fetchCalls({ token, siteId }, period) {
  const url = `https://api.calltouch.ru/calls-service/RestAPI/${siteId}/calls-diary/calls`
    + `?clientApiId=${token}&dateFrom=${ru(period.from)}&dateTo=${ru(period.to)}&page=1&limit=1000`;
  const res = await request(url);
  const items = res.data?.records || res.data || [];

  return items.map((c) => ({
    date: String(c.date || '').slice(0, 10) || isoFromRu(c.callDate),
    hour: Number(String(c.callTime || c.date || '').slice(11, 13)) || 0,
    channel: mapSource(c),
    answered: c.callphase === 'answer' || c.successful === true,
    durationSec: Number(c.duration || 0),
    target: c.targetCall === true || c.uniqTargetCall === true,
    waitSec: Number(c.waitingConnect || 0),
  }));
}

/** Источник звонка Calltouch отдаёт по-разному в зависимости от разметки — сводим к каналам модели. */
function mapSource(c) {
  const src = String(c.source || c.utmSource || '').toLowerCase();
  if (src.includes('yandex') && /search|поиск/.test(String(c.utmMedium || ''))) return 'Яндекс.Директ — Поиск';
  if (src.includes('yandex')) return 'Яндекс.Директ — РСЯ';
  if (src.includes('vk')) return 'VK Ads';
  if (src.includes('telegram') || src.includes('tg')) return 'Telegram';
  if (src.includes('organic') || src.includes('seo')) return 'SEO';
  return c.source || 'Прочее';
}

const ru = (iso) => iso.split('-').reverse().join('/');
const isoFromRu = (s) => (s ? s.slice(6, 10) + '-' + s.slice(3, 5) + '-' + s.slice(0, 2) : '');
