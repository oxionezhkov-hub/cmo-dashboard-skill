// Приведение сырых выгрузок (Директ / Метрика / бот / amoCRM / Таблицы)
// к единой модели дашборда. Один вход — один JSON, который рисует index.html.
import { round, div, pct, delta, sum, dateRange } from './lib/util.js';

const CH_ORDER = ['Яндекс.Директ — Поиск', 'Яндекс.Директ — РСЯ', 'Мастер кампаний', 'VK Ads', 'Telegram Ads', 'Telegram-бот', 'Telegram', 'SEO', 'Email', 'Прочее'];

export function normalize({ current, previous, meta = {} }) {
  // Директ, VK Ads и Telegram Ads приходят из разных кабинетов, но в модели это
  // один и тот же тип строки: дата + кампания + показы/клики/расход.
  current.ads = [...current.direct, ...(current.vk || []), ...(current.tgAds || [])];
  previous.ads = [...previous.direct, ...(previous.vk || []), ...(previous.tgAds || [])];
  const cur = aggregate(current);
  const prev = aggregate(previous);

  const days = dateRange(current.period.from, current.period.to);
  const daily = days.map((date) => {
    const d = cur.byDate[date] || {};
    return {
      date,
      spend: round(d.spend || 0),
      clicks: d.clicks || 0,
      impressions: d.impressions || 0,
      visits: d.visits || 0,
      leads: d.leads || 0,
      qualified: d.qualified || 0,
      deals: d.deals || 0,
      revenue: d.revenue || 0,
      cpl: div(d.spend || 0, d.leads || 0, 0),
    };
  });

  const extraCosts = sum(current.sheets.costs, 'spend');
  const prevExtra = sum(previous.sheets.costs, 'spend');
  const totalSpend = cur.spend + extraCosts;
  const prevTotalSpend = prev.spend + prevExtra;
  const planOf = (m) => (current.sheets.plan.find((p) => p.metric === m) || {}).plan ?? null;

  const kpi = [
    kpiTile('spend', 'Расход, ₽', totalSpend, prevTotalSpend, daily.map((d) => d.spend), { unit: '₽', good: 'neutral', source: 'Яндекс.Директ + Google Sheets' }),
    kpiTile('leads', 'Заявки', cur.leads, prev.leads, daily.map((d) => d.leads), { good: 'up', plan: planOf('Заявки'), source: 'amoCRM' }),
    kpiTile('cpl', 'CPL, ₽', div(totalSpend, cur.leads, 0), div(prevTotalSpend, prev.leads, 0), daily.map((d) => d.cpl), { unit: '₽', good: 'down', plan: planOf('CPL'), source: 'Директ + amoCRM' }),
    kpiTile('qualified', 'Квал. заявки', cur.qualified, prev.qualified, daily.map((d) => d.qualified), { good: 'up', plan: planOf('Квал. заявки'), source: 'amoCRM' }),
    kpiTile('qualRate', 'Доля квал., %', pct(cur.qualified, cur.leads), pct(prev.qualified, prev.leads), daily.map((d) => pct(d.qualified, d.leads)), { unit: '%', good: 'up', source: 'amoCRM' }),
    kpiTile('deals', 'Продажи', cur.deals, prev.deals, daily.map((d) => d.deals), { good: 'up', plan: planOf('Продажи'), source: 'amoCRM' }),
    kpiTile('revenue', 'Выручка, ₽', cur.revenue, prev.revenue, daily.map((d) => d.revenue), { unit: '₽', good: 'up', plan: planOf('Выручка'), source: 'amoCRM' }),
    kpiTile('romi', 'ROMI, %', pct(cur.revenue - totalSpend, totalSpend), pct(prev.revenue - prevTotalSpend, prevTotalSpend), daily.map((d) => pct(d.revenue - d.spend, d.spend || 1)), { unit: '%', good: 'up', source: 'Расчёт' }),
  ];

  const channels = CH_ORDER
    .map((name) => {
      const c = cur.byChannel[name];
      const p = prev.byChannel[name] || {};
      if (!c) return null;
      return {
        name,
        spend: round(c.spend),
        clicks: c.clicks,
        leads: c.leads,
        qualified: c.qualified,
        deals: c.deals,
        revenue: c.revenue,
        cpl: div(c.spend, c.leads, 0),
        cplDelta: delta(div(c.spend, c.leads, 2), div(p.spend || 0, p.leads || 0, 2)),
        qualRate: pct(c.qualified, c.leads),
        romi: c.spend ? pct(c.revenue - c.spend, c.spend) : null,
        paid: c.spend > 0,
      };
    })
    .filter(Boolean);

  const campaigns = Object.values(cur.byCampaign)
    .map((c) => {
      const p = prev.byCampaign[c.name] || {};
      return {
        name: c.name,
        channel: c.channel,
        spend: round(c.spend),
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: pct(c.clicks, c.impressions, 2),
        cpc: div(c.spend, c.clicks, 0),
        leads: c.leads,
        cpl: div(c.spend, c.leads, 0),
        cplPrev: div(p.spend || 0, p.leads || 0, 0),
        cplDelta: delta(div(c.spend, c.leads, 2), div(p.spend || 0, p.leads || 0, 2)),
        qualified: c.qualified,
        qualRate: pct(c.qualified, c.leads),
        deals: c.deals,
        revenue: c.revenue,
        romi: pct(c.revenue - c.spend, c.spend),
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const funnel = [
    { stage: 'Показы', value: cur.impressions, source: 'Директ' },
    { stage: 'Клики', value: cur.clicks, source: 'Директ' },
    { stage: 'Визиты на сайт', value: cur.visits + cur.clicks, source: 'Метрика' },
    { stage: 'Заявки', value: cur.leads, source: 'amoCRM' },
    { stage: 'Квал. заявки', value: cur.qualified, source: 'amoCRM' },
    { stage: 'Продажи', value: cur.deals, source: 'amoCRM' },
  ];

  const metrikaSources = groupBy(current.metrika, 'source').map(([source, rows]) => ({
    source,
    visits: sum(rows, 'visits'),
    bounceRate: round(avg(rows, 'bounceRate'), 1),
    pageDepth: round(avg(rows, 'pageDepth'), 2),
    leads: sum(rows, 'goalLeads'),
    cr: pct(sum(rows, 'goalLeads'), sum(rows, 'visits'), 2),
  })).sort((a, b) => b.visits - a.visits);

  const bot = {
    joined: sum(current.bot, 'joined'),
    left: sum(current.bot, 'left'),
    started: sum(current.bot, 'started'),
    quizCompleted: sum(current.bot, 'quizCompleted'),
    bookedCall: sum(current.bot, 'bookedCall'),
    joinedDelta: delta(sum(current.bot, 'joined'), sum(previous.bot, 'joined')),
    quizRate: pct(sum(current.bot, 'quizCompleted'), sum(current.bot, 'started')),
    quizRatePrev: pct(sum(previous.bot, 'quizCompleted'), sum(previous.bot, 'started')),
    daily: current.bot.map((d) => ({
      date: d.date,
      joined: d.joined,
      started: d.started,
      quizCompleted: d.quizCompleted,
      bookedCall: d.bookedCall,
      quizRate: pct(d.quizCompleted, d.started),
    })),
    funnel: [
      { stage: 'Подписались на бота', value: sum(current.bot, 'joined') },
      { stage: 'Нажали /start и пошли в квиз', value: sum(current.bot, 'started') },
      { stage: 'Прошли квиз до конца', value: sum(current.bot, 'quizCompleted') },
      { stage: 'Записались на консультацию', value: sum(current.bot, 'bookedCall') },
    ],
  };

  const amo = {
    pipeline: pipeline(current.leads),
    managers: managers(current.leads, previous.leads),
    lostReasons: groupBy(current.leads.filter((l) => l.lostReason), 'lostReason')
      .map(([reason, rows]) => ({ reason, count: rows.length }))
      .sort((a, b) => b.count - a.count),
    avgCycle: round(avg(current.leads, 'cycleDays'), 1),
    avgCyclePrev: round(avg(previous.leads, 'cycleDays'), 1),
    avgCheck: div(cur.revenue, cur.deals, 0),
    avgCheckPrev: div(prev.revenue, prev.deals, 0),
  };

  const sheets = {
    costs: current.sheets.costs,
    extraCosts,
    planFact: [
      planRow('Заявки', cur.leads, planOf('Заявки')),
      planRow('Квал. заявки', cur.qualified, planOf('Квал. заявки')),
      planRow('Продажи', cur.deals, planOf('Продажи')),
      planRow('Выручка', cur.revenue, planOf('Выручка')),
      planRow('CPL', div(totalSpend, cur.leads, 0), planOf('CPL'), 'down'),
    ],
  };

  const channelsDaily = perDay(current, 'channel');
  const campaignsDaily = perDay(current, 'campaign');

  const pages = (current.pages || []).map((p) => ({
    ...p,
    scrollRate: pct(p.scroll75, p.visits),
    readRate: pct(p.scroll100, p.visits),
    ctaRate: pct(p.ctaClicks, p.visits),
    formRate: pct(p.formSubmits, p.formStarts),
    submitRate: pct(p.formSubmits, p.visits),
    rageRate: pct(p.rageClicks, p.visits),
    avgTime: `${Math.floor(p.avgTimeSec / 60)}:${String(p.avgTimeSec % 60).padStart(2, '0')}`,
  })).sort((a, b) => b.visits - a.visits);

  const calls = callStats(current.calls || [], previous.calls || []);

  return {
    meta: {
      company: meta.company || '—',
      period: current.period,
      comparePeriod: previous.period,
      generatedAt: new Date().toISOString(),
      mode: meta.mode || 'demo',
      currency: '₽',
    },
    sources: meta.sources || [],
    kpi,
    daily,
    channels,
    campaigns,
    funnel,
    metrika: { sources: metrikaSources, visits: sum(current.metrika, 'visits') },
    telegram: bot,
    amo,
    sheets,
    channelsDaily,
    campaignsDaily,
    pages,
    calls,
    totals: { spend: round(totalSpend), leads: cur.leads, qualified: cur.qualified, deals: cur.deals, revenue: cur.revenue },
  };
}

/** Разрез «день × канал» или «день × кампания»: нужен, чтобы дашборд умел менять период сам. */
function perDay(raw, dimension) {
  const map = new Map();
  const key = (date, name) => `${date}||${name}`;
  const touch = (date, name) => {
    const k = key(date, name);
    if (!map.has(k)) map.set(k, { date, [dimension]: name, impressions: 0, clicks: 0, spend: 0, leads: 0, qualified: 0, deals: 0, revenue: 0 });
    return map.get(k);
  };
  for (const r of raw.ads) {
    const name = dimension === 'campaign' ? r.campaign : channelOfCampaign(raw, r.campaign);
    const t = touch(r.date, name);
    t.impressions += r.impressions; t.clicks += r.clicks; t.spend += r.spend;
  }
  for (const l of raw.leads) {
    const name = dimension === 'campaign' ? l.campaign : l.channel;
    if (!name || name === '—') continue;
    const t = touch(l.createdAt.slice(0, 10), name);
    t.leads += 1;
    if (l.qualified) t.qualified += 1;
    if (l.amount > 0) { t.deals += 1; t.revenue += l.amount; }
  }
  return [...map.values()].map((r) => ({ ...r, spend: round(r.spend) })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Коллтрекинг: сколько звонков теряется и когда именно. */
function callStats(calls, prevCalls) {
  const answered = calls.filter((c) => c.answered);
  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const rows = calls.filter((c) => c.hour === hour);
    return { hour, total: rows.length, missed: rows.filter((c) => !c.answered).length };
  }).filter((h) => h.total);
  const byWeekday = Array.from({ length: 7 }, (_, day) => {
    const rows = calls.filter((c) => new Date(c.date).getUTCDay() === day);
    return {
      day: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][day],
      total: rows.length,
      missed: rows.filter((c) => !c.answered).length,
      missedRate: pct(rows.filter((c) => !c.answered).length, rows.length),
    };
  }).filter((d) => d.total);
  const byChannel = [...new Set(calls.map((c) => c.channel))].map((channel) => {
    const rows = calls.filter((c) => c.channel === channel);
    return {
      channel,
      total: rows.length,
      answered: rows.filter((c) => c.answered).length,
      target: rows.filter((c) => c.target).length,
      targetRate: pct(rows.filter((c) => c.target).length, rows.length),
    };
  }).sort((a, b) => b.total - a.total);
  return {
    total: calls.length,
    answered: answered.length,
    missed: calls.length - answered.length,
    missedRate: pct(calls.length - answered.length, calls.length),
    missedRatePrev: pct(prevCalls.filter((c) => !c.answered).length, prevCalls.length),
    target: calls.filter((c) => c.target).length,
    targetRate: pct(calls.filter((c) => c.target).length, calls.length),
    avgWait: round(answered.reduce((a, c) => a + c.waitSec, 0) / (answered.length || 1), 0),
    avgTalk: round(answered.reduce((a, c) => a + c.durationSec, 0) / (answered.length || 1), 0),
    byHour, byWeekday, byChannel,
  };
}

function planRow(metric, fact, plan, good = 'up') {
  return { metric, fact: round(fact), plan, done: plan ? pct(fact, plan) : null, good };
}

function kpiTile(id, label, value, prevValue, spark, opts = {}) {
  return {
    id, label,
    value: round(value, value < 100 ? 1 : 0),
    prev: round(prevValue, 1),
    delta: delta(value, prevValue),
    good: opts.good || 'up',
    unit: opts.unit || '',
    plan: opts.plan ?? null,
    planDone: opts.plan ? pct(value, opts.plan) : null,
    spark,
    source: opts.source || '',
  };
}

function aggregate(raw) {
  const byDate = {}, byChannel = {}, byCampaign = {};
  const touch = (obj, key, extra = {}) => (obj[key] ||= { impressions: 0, clicks: 0, spend: 0, visits: 0, leads: 0, qualified: 0, deals: 0, revenue: 0, ...extra });

  for (const r of raw.ads) {
    const d = touch(byDate, r.date);
    const ch = touch(byChannel, channelOfCampaign(raw, r.campaign));
    const cp = touch(byCampaign, r.campaign, { name: r.campaign, channel: channelOfCampaign(raw, r.campaign) });
    for (const t of [d, ch, cp]) { t.impressions += r.impressions; t.clicks += r.clicks; t.spend += r.spend; }
  }
  for (const r of raw.metrika) {
    touch(byDate, r.date).visits += r.visits;
  }
  for (const l of raw.leads) {
    const date = l.createdAt.slice(0, 10);
    const d = touch(byDate, date);
    const ch = touch(byChannel, l.channel);
    const cp = l.campaign && l.campaign !== '—' ? touch(byCampaign, l.campaign, { name: l.campaign, channel: l.channel }) : null;
    for (const t of [d, ch, cp]) {
      if (!t) continue;
      t.leads += 1;
      if (l.qualified) t.qualified += 1;
      if (l.amount > 0) { t.deals += 1; t.revenue += l.amount; }
    }
  }
  const totals = Object.values(byDate).reduce((a, d) => ({
    impressions: a.impressions + d.impressions, clicks: a.clicks + d.clicks, spend: a.spend + d.spend,
    visits: a.visits + d.visits, leads: a.leads + d.leads, qualified: a.qualified + d.qualified,
    deals: a.deals + d.deals, revenue: a.revenue + d.revenue,
  }), { impressions: 0, clicks: 0, spend: 0, visits: 0, leads: 0, qualified: 0, deals: 0, revenue: 0 });
  return { byDate, byChannel, byCampaign, ...totals };
}

const campaignChannelCache = new Map();
function channelOfCampaign(raw, name) {
  if (!campaignChannelCache.has(name)) {
    const lead = raw.leads.find((l) => l.campaign === name);
    campaignChannelCache.set(name, lead ? lead.channel : 'Прочее');
  }
  return campaignChannelCache.get(name);
}

function pipeline(leads) {
  const stages = ['В работе', 'Успешно реализовано', 'Закрыто и не реализовано'];
  return stages.map((stage) => {
    const rows = leads.filter((l) => l.status === stage);
    return { stage, count: rows.length, sum: rows.reduce((a, l) => a + l.amount, 0) };
  });
}

function managers(leads, prevLeads) {
  return groupBy(leads, 'manager').map(([name, rows]) => {
    const prev = prevLeads.filter((l) => l.manager === name);
    const won = rows.filter((l) => l.amount > 0);
    return {
      name,
      leads: rows.length,
      qualified: rows.filter((l) => l.qualified).length,
      deals: won.length,
      revenue: won.reduce((a, l) => a + l.amount, 0),
      convRate: pct(won.length, rows.filter((l) => l.qualified).length),
      avgCycle: round(avg(rows, 'cycleDays'), 1),
      avgCyclePrev: round(avg(prev, 'cycleDays'), 1),
      noAnswer: rows.filter((l) => l.lostReason === 'Не дозвонились').length,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()];
}

const avg = (rows, key) => (rows.length ? sum(rows, key) / rows.length : 0);
