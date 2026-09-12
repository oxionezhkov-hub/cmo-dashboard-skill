// Демо-источник: генерирует «сырые» данные в том же формате, в котором их
// отдают реальные коннекторы (yandex_direct.js, yandex_metrika.js и т.д.).
// Нужен, чтобы дашборд и весь пайплайн можно было показать без доступов к API.
import { rng, round, dateRange, weekdayFactor, isoDate } from './lib/util.js';

export const COMPANY = 'Онлайн-школа профессий «Вектор»';

export const CAMPAIGNS = [
  { id: 71100101, name: 'Поиск / Бренд',                channel: 'Яндекс.Директ — Поиск', cpc: 34,  ctr: 0.19,  clicks: 120, cr: 0.079, quality: 0.74 },
  { id: 71100102, name: 'Поиск / Профессия «Аналитик»', channel: 'Яндекс.Директ — Поиск', cpc: 96,  ctr: 0.082, clicks: 190, cr: 0.041, quality: 0.58 },
  { id: 71100103, name: 'Поиск / Профессия «Дизайнер»', channel: 'Яндекс.Директ — Поиск', cpc: 88,  ctr: 0.077, clicks: 170, cr: 0.038, quality: 0.54 },
  { id: 71100104, name: 'Поиск / Конкуренты',           channel: 'Яндекс.Директ — Поиск', cpc: 131, ctr: 0.058, clicks: 70,  cr: 0.026, quality: 0.44 },
  { id: 71100205, name: 'РСЯ / Ретаргетинг',            channel: 'Яндекс.Директ — РСЯ',   cpc: 22,  ctr: 0.006, clicks: 260, cr: 0.028, quality: 0.61 },
  { id: 71100206, name: 'РСЯ / Look-alike',             channel: 'Яндекс.Директ — РСЯ',   cpc: 19,  ctr: 0.004, clicks: 380, cr: 0.013, quality: 0.39 },
  { id: 71100207, name: 'РСЯ / Широкий интерес',        channel: 'Яндекс.Директ — РСЯ',   cpc: 17,  ctr: 0.003, clicks: 420, cr: 0.009, quality: 0.21, drift: 1.62 },
  { id: 71100308, name: 'Мастер кампаний / Автотаргет', channel: 'Мастер кампаний',       cpc: 41,  ctr: 0.021, clicks: 150, cr: 0.031, quality: 0.49 },
];

// Кабинеты, которые тянутся отдельными коннекторами, но живут в той же модели.
export const VK_CAMPAIGNS = [
  { id: 5510041, name: 'VK Ads / Лид-формы',   channel: 'VK Ads',       cpc: 28, ctr: 0.009, clicks: 300, cr: 0.052, quality: 0.42 },
  { id: 5510042, name: 'VK Ads / Ретаргетинг', channel: 'VK Ads',       cpc: 24, ctr: 0.011, clicks: 180, cr: 0.036, quality: 0.57 },
  { id: 9900071, name: 'Telegram Ads / Каналы про карьеру', channel: 'Telegram Ads', cpc: 63, ctr: 0.013, clicks: 210, cr: 0.024, quality: 0.66 },
];

const ALL_PAID = () => [...CAMPAIGNS, ...VK_CAMPAIGNS];

// Страницы сайта: поведение из Метрики и Вебвизора.
const PAGES = [
  { url: '/',                     title: 'Главная',                          visits: 1180, time: 96,  s50: .72, s75: .48, s100: .27, cta: .091, formStart: .052, formSend: .031, rage: .012 },
  { url: '/analyst',              title: 'Профессия «Аналитик данных»',      visits: 940,  time: 174, s50: .78, s75: .61, s100: .38, cta: .128, formStart: .086, formSend: .049, rage: .009 },
  { url: '/designer',             title: 'Профессия «Продуктовый дизайнер»', visits: 810,  time: 158, s50: .74, s75: .55, s100: .33, cta: .112, formStart: .074, formSend: .041, rage: .011 },
  { url: '/promo-autumn',         title: 'Осенний набор — лендинг акции',    visits: 690,  time: 41,  s50: .34, s75: .12, s100: .05, cta: .038, formStart: .019, formSend: .006, rage: .078 },
  { url: '/pricing',              title: 'Стоимость и рассрочка',            visits: 520,  time: 121, s50: .69, s75: .44, s100: .29, cta: .097, formStart: .061, formSend: .038, rage: .014 },
  { url: '/blog/data-profession', title: 'Блог: как войти в аналитику',      visits: 470,  time: 212, s50: .81, s75: .66, s100: .44, cta: .034, formStart: .017, formSend: .008, rage: .006 },
];

const ORGANIC = [
  { source: 'Органический поиск', visits: 940, bounce: 0.31, depth: 3.4, cr: 0.021 },
  { source: 'Telegram-канал',     visits: 610, bounce: 0.24, depth: 4.1, cr: 0.020 },
  { source: 'Email-рассылка',     visits: 240, bounce: 0.28, depth: 3.8, cr: 0.030 },
  { source: 'Переходы с сайтов',  visits: 180, bounce: 0.44, depth: 2.2, cr: 0.008 },
  { source: 'Прямые заходы',      visits: 320, bounce: 0.35, depth: 3.0, cr: 0.012 },
];

const MANAGERS = ['Анна К.', 'Игорь М.', 'Полина С.', 'Тимур Р.'];
const LOST_REASONS = ['Не дозвонились', 'Дорого', 'Выбрал конкурента', 'Не готов сейчас', 'Нецелевой'];

/**
 * @param {{from:string,to:string}} period
 * @param {{seed?:number, decay?:number}} [opts] decay<1 — «прошлый период» (спокойнее)
 */
export function generateRaw(period, opts = {}) {
  const seed = opts.seed ?? 20260912;
  const rand = rng(seed);
  const days = dateRange(period.from, period.to);
  const n = days.length;
  const era = opts.era ?? 'current'; // current | previous

  const direct = [];
  const vk = [];
  const tgAds = [];
  const calls = [];
  const metrika = [];
  const bot = [];
  const leads = [];
  let leadSeq = opts.leadStart ?? 100000;

  days.forEach((date, i) => {
    const wf = weekdayFactor(date);
    const progress = n > 1 ? i / (n - 1) : 0;
    const noise = () => 0.86 + rand() * 0.28;

    // ---- Рекламные кабинеты: показы / клики / расход по кампаниям ----
    for (const c of ALL_PAID()) {
      // «Широкий интерес» в текущем периоде разгоняют — это и станет главным инсайтом.
      const driftK = c.drift && era === 'current' ? 1 + (c.drift - 1) * progress : 1;
      const clicks = Math.round(c.clicks * wf * noise() * driftK * (era === 'previous' ? 0.92 : 1));
      const impressions = Math.round((clicks / c.ctr) * noise());
      const cpcToday = round(c.cpc * (era === 'current' ? 1 + 0.09 * progress : 1) * noise(), 2);
      const spend = round(clicks * cpcToday, 2);
      const row = { date, campaignId: c.id, campaign: c.name, impressions, clicks, spend };
      if (c.channel === 'VK Ads') vk.push(row);
      else if (c.channel === 'Telegram Ads') tgAds.push(row);
      else direct.push(row);

      // ---- Заявки из платного трафика (в CRM попадут как сделки) ----
      const crK = c.drift && era === 'current' ? 1 - 0.28 * progress : 1;
      const count = Math.round(clicks * c.cr * crK * noise());
      for (let k = 0; k < count; k++) {
        leads.push(makeLead(rand, ++leadSeq, date, c.channel, c.name, c.quality, era, progress));
      }
    }

    // ---- Метрика: визиты по источникам ----
    for (const s of ORGANIC) {
      const visits = Math.round(s.visits * wf * noise() * (era === 'previous' ? 0.9 : 1));
      const goalLeads = Math.round(visits * s.cr * noise());
      metrika.push({
        date, source: s.source, visits,
        bounceRate: round(s.bounce * noise() * 100, 1),
        pageDepth: round(s.depth * noise(), 2),
        goalLeads,
      });
      const chan = s.source === 'Telegram-канал' ? 'Telegram' : s.source === 'Email-рассылка' ? 'Email' : s.source === 'Органический поиск' ? 'SEO' : 'Прочее';
      for (let k = 0; k < goalLeads; k++) {
        leads.push(makeLead(rand, ++leadSeq, date, chan, '—', 0.66, era, progress));
      }
    }

    // ---- Коллтрекинг: звонки по дням и часам ----
    const weekend = [0, 6].includes(new Date(date).getUTCDay());
    const callCount = Math.round((weekend ? 26 : 48) * noise());
    for (let k = 0; k < callCount; k++) {
      const hour = 9 + Math.floor(rand() * 12);
      // По выходным и после 19:00 звонки некому брать — это станет отдельным инсайтом.
      const answered = rand() < (weekend || hour >= 19 ? 0.41 : 0.88);
      const chan = rand() < 0.52 ? 'Яндекс.Директ — Поиск' : rand() < 0.5 ? 'SEO' : 'VK Ads';
      calls.push({
        date, hour, channel: chan,
        answered,
        durationSec: answered ? Math.round(40 + rand() * 320) : 0,
        target: answered && rand() < 0.62,
        waitSec: Math.round(6 + rand() * 34),
      });
    }

    // ---- Telegram-бот ----
    // В текущем периоде на 18-й день ломается шаг «квиз» — второй инсайт.
    const broken = era === 'current' && i >= 18;
    const started = Math.round(78 * wf * noise());
    const quiz = Math.round(started * (broken ? 0.24 : 0.63) * noise());
    const booked = Math.round(quiz * 0.41 * noise());
    bot.push({
      date,
      joined: Math.round(96 * wf * noise()),
      left: Math.round(11 * wf * noise()),
      started,
      quizCompleted: quiz,
      bookedCall: booked,
    });
    for (let k = 0; k < booked; k++) {
      leads.push(makeLead(rand, ++leadSeq, date, 'Telegram-бот', 'Бот · квиз', 0.81, era, progress));
    }
  });

  return {
    period,
    direct,
    vk,
    tgAds,
    calls,
    metrika,
    pages: buildPages(rand, n, era),
    bot,
    leads,
    sheets: buildSheets(period, era),
    lastLeadId: leadSeq,
  };
}

function makeLead(rand, id, date, channel, campaign, quality, era, progress) {
  const qualified = rand() < quality;
  // Скорость обработки в текущем периоде проседает — третий инсайт.
  const manager = MANAGERS[Math.floor(rand() * MANAGERS.length)];
  const slow = era === 'current' && manager === 'Игорь М.';
  const cycle = round((slow ? 6.4 : 3.1) * (0.7 + rand() * 0.9) + (era === 'current' ? progress * 0.8 : 0), 1);
  const won = qualified && rand() < (slow ? 0.055 : 0.10);
  const amount = won ? Math.round((48000 + rand() * 92000) / 1000) * 1000 : 0;
  const status = won ? 'Успешно реализовано' : qualified ? (rand() < 0.55 ? 'В работе' : 'Закрыто и не реализовано') : 'Закрыто и не реализовано';
  return {
    id: `L-${id}`,
    createdAt: `${date}T${String(8 + Math.floor(rand() * 12)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`,
    channel, campaign, manager,
    qualified,
    status,
    amount,
    cycleDays: cycle,
    lostReason: status === 'Закрыто и не реализовано'
      ? (slow && rand() < 0.5 ? 'Не дозвонились' : LOST_REASONS[Math.floor(rand() * LOST_REASONS.length)])
      : null,
  };
}

// ---- Метрика + Вебвизор: поведение на страницах за период ----
function buildPages(rand, days, era) {
  const k = era === 'previous' ? 0.93 : 1;
  return PAGES.map((p) => {
    const visits = Math.round(p.visits * days * 0.74 * k * (0.9 + rand() * 0.2));
    const r = (share) => Math.round(visits * share * (0.92 + rand() * 0.16));
    return {
      url: p.url,
      title: p.title,
      visits,
      avgTimeSec: Math.round(p.time * (0.9 + rand() * 0.2)),
      scroll50: r(p.s50),
      scroll75: r(p.s75),
      scroll100: r(p.s100),
      ctaClicks: r(p.cta),
      formStarts: r(p.formStart),
      formSubmits: r(p.formSend),
      rageClicks: r(p.rage),
    };
  });
}

// ---- Google Sheets: план и офлайн-расходы, которых нет ни в одном API ----
function buildSheets(period, era) {
  const month = period.to.slice(0, 7);
  const k = era === 'previous' ? 0.95 : 1;
  return {
    plan: [
      { month, metric: 'Заявки', plan: 3800 },
      { month, metric: 'Квал. заявки', plan: 2400 },
      { month, metric: 'Продажи', plan: 275 },
      { month, metric: 'Выручка', plan: 26000000 },
      { month, metric: 'CPL', plan: 850 },
    ],
    costs: [
      { month, channel: 'Контент и SEO', spend: round(310000 * k) },
      { month, channel: 'Коллтрекинг', spend: round(24000 * k) },
      { month, channel: 'Email-платформа', spend: round(38000 * k) },
      { month, channel: 'Работа агентства', spend: round(180000 * k) },
    ],
  };
}

export { MANAGERS, LOST_REASONS, ORGANIC };
export const demoMeta = { company: COMPANY, generatedFrom: 'demo_source.js' };
export const todayIso = () => isoDate(new Date());
