#!/usr/bin/env node
// Точка входа пайплайна: собрать данные -> привести к единому виду -> посчитать
// инсайты -> положить в dashboard/data/. Дашборд читает только результат.
//
//   node collect.js                    # демо-данные (без доступов)
//   node collect.js --mode=live        # реальные API по config.json
//   node collect.js --ai               # инсайты через Claude API
//   node collect.js --notify           # ещё и отправить дайджест в Telegram
//   node collect.js --from=2026-08-15 --to=2026-09-11
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, isoDate } from './lib/util.js';
import { generateRaw, COMPANY } from './demo_source.js';
import { normalize } from './normalize.js';
import { buildRuleInsights, buildAIInsights, buildDigest } from './insights.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', 'data');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const log = (...m) => console.log('•', ...m);

const SOURCE_NAMES = ['Яндекс.Директ', 'VK Ads', 'Telegram Ads', 'Яндекс.Метрика', 'Вебвизор и страницы', 'Telegram-бот', 'amoCRM', 'Коллтрекинг', 'Google Sheets'];

async function loadConfig() {
  for (const name of ['config.json', 'config.example.json']) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8'));
      if (name === 'config.example.json') log('config.json не найден, беру config.example.json');
      return resolveEnv(raw);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw new Error('Нет ни config.json, ни config.example.json');
}

/** Значения вида "env:NAME" подставляются из переменных окружения. */
function resolveEnv(node) {
  if (typeof node === 'string') return node.startsWith('env:') ? (process.env[node.slice(4)] || '') : node;
  if (Array.isArray(node)) return node.map(resolveEnv);
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveEnv(v)]));
  return node;
}

function periods(cfg) {
  const days = Number(args.days || cfg.periodDays || 28);
  const to = args.to || isoDate(addDays(new Date(), -1));
  const from = args.from || isoDate(addDays(to, -(days - 1)));
  const prevTo = isoDate(addDays(from, -1));
  const prevFrom = isoDate(addDays(prevTo, -(days - 1)));
  return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
}

async function collectLive(cfg, period, statuses) {
  const s = cfg.sources;
  const [direct, vk, tgAds, metrika, pages, tg, leads, calls, sheets] = await Promise.all([
    tryFetch('Яндекс.Директ', statuses, s.direct?.enabled, () => import('./yandex_direct.js').then((m) => m.fetchDirect(s.direct, period)), []),
    tryFetch('VK Ads', statuses, s.vk?.enabled, () => import('./vk_ads.js').then((m) => m.fetchVkAds(s.vk, period)), []),
    tryFetch('Telegram Ads', statuses, s.telegramAds?.enabled, () => import('./telegram_ads.js').then((m) => m.fetchTelegramAds(s.telegramAds, period)), []),
    tryFetch('Яндекс.Метрика', statuses, s.metrika?.enabled, () => import('./yandex_metrika.js').then((m) => m.fetchMetrika(s.metrika, period)), []),
    tryFetch('Вебвизор и страницы', statuses, s.metrika?.enabled, () => import('./yandex_metrika.js').then((m) => m.fetchPageActivity(s.metrika, period)), []),
    tryFetch('Telegram-бот', statuses, s.telegram?.enabled, () => import('./telegram_bot.js').then((m) => m.fetchTelegram(s.telegram, period)), { daily: [] }),
    tryFetch('amoCRM', statuses, s.amo?.enabled, () => import('./amocrm.js').then((m) => m.fetchAmo(s.amo, period)), []),
    tryFetch('Коллтрекинг', statuses, s.calls?.enabled, () => import('./calltouch.js').then((m) => m.fetchCalls(s.calls, period)), []),
    tryFetch('Google Sheets', statuses, s.sheets?.enabled, () => import('./google_sheets.js').then((m) => m.fetchSheets(s.sheets, period)), { plan: [], costs: [] }),
  ]);
  return { period, direct, vk, tgAds, metrika, pages, bot: tg.daily, leads, calls, sheets };
}

async function tryFetch(name, statuses, enabled, fn, fallback) {
  if (!enabled) { statuses.push({ name, status: 'off', note: 'выключен в config' }); return fallback; }
  const t0 = Date.now();
  try {
    const data = await fn();
    const rows = Array.isArray(data) ? data.length : (data.daily?.length ?? Object.keys(data).length);
    statuses.push({ name, status: 'ok', rows, ms: Date.now() - t0 });
    log(`${name}: ok, ${rows} строк за ${Date.now() - t0} мс`);
    return data;
  } catch (err) {
    statuses.push({ name, status: 'error', note: String(err.message).slice(0, 200) });
    console.error(`✗ ${name}: ${err.message}`);
    return fallback;
  }
}

async function main() {
  const cfg = await loadConfig();
  const mode = args.mode || cfg.mode || 'demo';
  const p = periods(cfg);
  const statuses = [];
  log(`Режим: ${mode}. Период: ${p.current.from} — ${p.current.to} (сравнение с ${p.previous.from} — ${p.previous.to})`);

  let current, previous;
  if (mode === 'live') {
    current = await collectLive(cfg, p.current, statuses);
    previous = await collectLive(cfg, p.previous, []);
  } else {
    current = generateRaw(p.current, { seed: 20260912, era: 'current' });
    previous = generateRaw(p.previous, { seed: 771003, era: 'previous', leadStart: 500000 });
    for (const name of SOURCE_NAMES) statuses.push({ name, status: 'ok', rows: null });
  }

  const data = normalize({ current, previous, meta: { company: cfg.company || COMPANY, mode, sources: statuses } });

  let insights = buildRuleInsights(data);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if ((args.ai || cfg.ai?.enabled) && apiKey) {
    try {
      insights = await buildAIInsights(data, { apiKey, model: cfg.ai?.model });
      log(`Инсайты от Claude: ${insights.length}`);
    } catch (err) {
      console.error(`✗ Claude API: ${err.message}. Оставляю инсайты по правилам.`);
    }
  } else if (args.ai) {
    console.error('✗ Нет ANTHROPIC_API_KEY — инсайты по правилам.');
  }
  data.insights = insights;
  data.digest = buildDigest(data, insights);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'dashboard.json'), JSON.stringify(data, null, 2));
  // Файл-двойник, чтобы дашборд открывался просто двойным кликом (file:// без fetch).
  await fs.writeFile(path.join(DATA_DIR, 'dashboard.js'), `window.DASHBOARD_DATA = ${JSON.stringify(data)};\n`);
  log(`Готово: ${data.totals.leads} заявок, ${data.insights.length} инсайтов -> dashboard/data/`);

  if (args.notify || cfg.notify?.enabled) await notify(cfg, data);
}

async function notify(cfg, data) {
  const { botToken, chatId, onlyIfCritical } = cfg.notify || {};
  if (!botToken || !chatId) return console.error('✗ notify: нет botToken или chatId');
  if (onlyIfCritical && !data.insights.some((i) => i.severity === 'critical')) {
    return log('notify: критичных инсайтов нет, дайджест не отправляю');
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: data.digest, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  log(res.ok ? 'notify: дайджест отправлен' : `notify: ошибка ${res.status} ${await res.text()}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
