// Яндекс.Метрика — Reporting API (https://yandex.ru/dev/metrika/doc/api2/api_v1/intro.html).
// Токен: OAuth с правами на счётчик. goalId — цель «Заявка» в счётчике.
import { request } from './lib/http.js';

const ENDPOINT = 'https://api-metrika.yandex.net/stat/v1/data';

export async function fetchMetrika({ token, counterId, goalId }, period) {
  const metrics = ['ym:s:visits', 'ym:s:bounceRate', 'ym:s:pageDepth'];
  if (goalId) metrics.push(`ym:s:goal${goalId}reaches`);
  const params = new URLSearchParams({
    ids: String(counterId),
    date1: period.from,
    date2: period.to,
    metrics: metrics.join(','),
    dimensions: 'ym:s:date,ym:s:lastsignTrafficSource',
    limit: '10000',
    accuracy: 'full',
  });
  const res = await request(`${ENDPOINT}?${params}`, { headers: { Authorization: `OAuth ${token}` } });
  return res.data.data.map((row) => ({
    date: row.dimensions[0].name,
    source: row.dimensions[1].name,
    visits: row.metrics[0],
    bounceRate: row.metrics[1],
    pageDepth: row.metrics[2],
    goalLeads: goalId ? row.metrics[3] : 0,
  }));
}

/**
 * Поведение на страницах: просмотры, время, прокрутка и клики.
 * Просмотры и время Метрика отдаёт сама; прокрутка, клики по CTA, старт и отправка формы —
 * это цели/события, которые нужно один раз настроить в счётчике (id передаются в pageGoals).
 * Рейдж-клики Метрика в API не отдаёт: их считает Вебвизор, поэтому берём событие
 * «клик по некликабельному», если оно настроено, иначе поле остаётся нулевым.
 */
export async function fetchPageActivity({ token, counterId, pageGoals = {} }, period) {
  const goal = (id) => (id ? `,ym:pv:goal${id}reaches` : '');
  const params = new URLSearchParams({
    ids: String(counterId),
    date1: period.from,
    date2: period.to,
    metrics: `ym:pv:pageviews,ym:pv:avgTimeOnPage${
      [pageGoals.scroll50, pageGoals.scroll75, pageGoals.scroll100, pageGoals.cta, pageGoals.formStart, pageGoals.formSubmit, pageGoals.rage].map(goal).join('')}`,
    dimensions: 'ym:pv:URLPathFull,ym:pv:title',
    sort: '-ym:pv:pageviews',
    limit: '50',
  });
  const res = await request(`${ENDPOINT}?${params}`, { headers: { Authorization: `OAuth ${token}` } });
  return (res.data?.data || []).map((row) => {
    const m = row.metrics;
    let i = 2;
    const next = (id) => (id ? m[i++] || 0 : 0);
    return {
      url: row.dimensions[0].name,
      title: row.dimensions[1]?.name || row.dimensions[0].name,
      visits: Math.round(m[0]),
      avgTimeSec: Math.round(m[1]),
      scroll50: Math.round(next(pageGoals.scroll50)),
      scroll75: Math.round(next(pageGoals.scroll75)),
      scroll100: Math.round(next(pageGoals.scroll100)),
      ctaClicks: Math.round(next(pageGoals.cta)),
      formStarts: Math.round(next(pageGoals.formStart)),
      formSubmits: Math.round(next(pageGoals.formSubmit)),
      rageClicks: Math.round(next(pageGoals.rage)),
    };
  });
}
