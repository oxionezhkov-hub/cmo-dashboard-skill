// ИИ-инсайты. Два режима:
//   1) rules  — детерминированные правила, работают всегда и без ключей (по умолчанию);
//   2) claude — правила отдаются модели как «улики», она пишет выводы для руководителя.
// Правила нужны и в режиме claude: они считают цифры, чтобы модель их не выдумывала.
import { round, pct, div } from './lib/util.js';

const money = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export function buildRuleInsights(d) {
  const out = [];
  const paidCampaigns = d.campaigns.filter((c) => c.spend > 0);
  // Средний CPL считаем только по платному трафику — иначе бесплатные заявки
  // занижают планку и «плохой» выглядит любая кампания.
  const paidSpend = paidCampaigns.reduce((a, c) => a + c.spend, 0);
  const paidLeads = paidCampaigns.reduce((a, c) => a + c.leads, 0);
  const avgCpl = div(paidSpend, paidLeads, 0);
  const avgQual = pct(paidCampaigns.reduce((a, c) => a + c.qualified, 0), paidLeads);

  // 1. Кампании, которые разгоняют CPL: дороже среднего, хуже по качеству и заметны в бюджете
  const burners = paidCampaigns
    .filter((c) => (c.cpl > avgCpl * 1.4 || c.cplDelta > 25) && c.qualRate < avgQual && pct(c.spend, paidSpend) > 5)
    .map((c) => ({ c, waste: c.spend - c.leads * avgCpl }))
    .sort((a, b) => b.waste - a.waste)
    .slice(0, 2);
  for (const { c, waste } of burners) {
    {
      const shareOfSpend = pct(c.spend, paidSpend);
      out.push({
        id: `cpl-${slug(c.name)}`,
        severity: 'critical',
        title: `«${c.name}» съедает бюджет: CPL ${Math.round(c.cpl).toLocaleString('ru-RU')} ₽ при среднем ${Math.round(avgCpl).toLocaleString('ru-RU')} ₽`,
        summary: `Кампания забирает ${shareOfSpend}% платного бюджета и даёт ${pct(c.leads, paidLeads)}% платных заявок. Квалификация ${c.qualRate}% против ${avgQual}% в среднем по платному трафику. CPL за период изменился на ${c.cplDelta}%.`,
        evidence: [
          { label: 'Расход', value: money(c.spend) },
          { label: 'Заявки', value: c.leads },
          { label: 'CPL', value: money(c.cpl) },
          { label: 'Доля квал.', value: `${c.qualRate}%` },
        ],
        action: `Урезать дневной бюджет в 2 раза, перенести деньги в «${bestByRomi(paidCampaigns).name}». Ожидаемая экономия — ${money(Math.max(waste, 0))} за период.`,
        impact: Math.max(round(waste), 0),
        sources: ['Яндекс.Директ', 'amoCRM'],
      });
    }
  }

  // 2. Поломка в воронке телеграм-бота
  const tg = d.telegram;
  const half = Math.floor(tg.daily.length / 2);
  const early = avgOf(tg.daily.slice(0, half), 'quizRate');
  const late = avgOf(tg.daily.slice(half), 'quizRate');
  if (early > 0 && late < early * 0.75) {
    const lostLeads = Math.round(((early - late) / 100) * sumOf(tg.daily.slice(half), 'started') * 0.41);
    out.push({
      id: 'tg-funnel-drop',
      severity: 'critical',
      title: `Воронка бота просела: до квиза доходит ${round(late)}% вместо ${round(early)}%`,
      summary: `Во второй половине периода конверсия «/start → квиз пройден» упала почти вдвое. Приток подписчиков не менялся (${tg.joined} за период), значит дело не в трафике, а в самом сценарии бота.`,
      evidence: [
        { label: 'Было', value: `${round(early)}%` },
        { label: 'Стало', value: `${round(late)}%` },
        { label: 'Записей на консультацию', value: tg.bookedCall },
      ],
      action: `Проверить последний деплой бота и шаг с вопросом квиза: похоже, часть пользователей отваливается на нём. Потенциально теряем ~${lostLeads} заявок за две недели.`,
      impact: round(lostLeads * div(d.totals.revenue, d.totals.leads, 0)),
      sources: ['Telegram Bot API'],
    });
  }

  // 3. Обработка заявок в отделе продаж
  const slowest = [...d.amo.managers].sort((a, b) => b.avgCycle - a.avgCycle)[0];
  const fastest = [...d.amo.managers].sort((a, b) => a.avgCycle - b.avgCycle)[0];
  if (slowest && slowest.avgCycle > fastest.avgCycle * 1.4) {
    out.push({
      id: 'sales-cycle',
      severity: 'warning',
      title: `${slowest.name} держит заявку ${slowest.avgCycle} дн. против ${fastest.avgCycle} дн. у ${fastest.name}`,
      summary: `Конверсия квал. заявки в продажу — ${slowest.convRate}% против ${fastest.convRate}%. «Не дозвонились» у него ${slowest.noAnswer} заявок — больше всех в отделе.`,
      evidence: [
        { label: 'Заявок', value: slowest.leads },
        { label: 'Продаж', value: slowest.deals },
        { label: 'Цикл', value: `${slowest.avgCycle} дн.` },
        { label: 'Не дозвонились', value: slowest.noAnswer },
      ],
      action: 'Поставить SLA: первый контакт — 15 минут, автонапоминание в amoCRM. Перераспределить входящие, пока цикл не выровняется.',
      impact: round(slowest.leads * (fastest.convRate - slowest.convRate) / 100 * d.amo.avgCheck),
      sources: ['amoCRM'],
    });
  }

  // 4. План / факт с прогнозом
  for (const row of d.sheets.planFact) {
    if (!row.plan || row.metric === 'CPL') continue;
    const daysPassed = d.daily.length;
    const forecast = (row.fact / daysPassed) * 30;
    const done = pct(forecast, row.plan);
    if (done < 90) {
      out.push({
        id: `plan-${slug(row.metric)}`,
        severity: done < 75 ? 'warning' : 'info',
        title: `${row.metric}: прогноз на месяц — ${done}% плана`,
        summary: `За ${daysPassed} дней сделано ${fmt(row.fact)} из ${fmt(row.plan)}. Текущий темп даёт ${fmt(round(forecast))} к концу месяца.`,
        evidence: [
          { label: 'Факт', value: fmt(row.fact) },
          { label: 'План', value: fmt(row.plan) },
          { label: 'Прогноз', value: fmt(round(forecast)) },
        ],
        action: 'Обсудить на планёрке: либо добавляем бюджет в каналы с лучшим ROMI, либо честно двигаем план.',
        impact: 0,
        sources: ['Google Sheets', 'amoCRM'],
      });
    }
  }

  // 5. Куда переложить деньги
  const best = bestByRomi(paidCampaigns);
  if (best) {
    out.push({
      id: `scale-${slug(best.name)}`,
      severity: 'opportunity',
      title: `«${best.name}» — лучший ROMI ${best.romi}%, здесь есть куда расти`,
      summary: `CPL ${money(best.cpl)}, доля квал. ${best.qualRate}%, выручка ${money(best.revenue)} при расходе ${money(best.spend)}.`,
      evidence: [
        { label: 'ROMI', value: `${best.romi}%` },
        { label: 'CPL', value: money(best.cpl) },
        { label: 'Выручка', value: money(best.revenue) },
      ],
      action: 'Поднять дневной бюджет на 30% и проверить долю потерянных показов по бюджету в Директе.',
      impact: round(best.revenue * 0.3),
      sources: ['Яндекс.Директ', 'amoCRM'],
    });
  }

  // 6. Пропущенные звонки
  const calls = d.calls;
  if (calls && calls.total > 50 && calls.missedRate > 15) {
    const worstDay = [...calls.byWeekday].sort((a, b) => b.missedRate - a.missedRate)[0];
    const evening = calls.byHour.filter((h) => h.hour >= 19).reduce((a, h) => ({ total: a.total + h.total, missed: a.missed + h.missed }), { total: 0, missed: 0 });
    const lostRevenue = round(calls.missed * (calls.targetRate / 100) * d.amo.avgCheck * (d.totals.deals / Math.max(d.totals.qualified, 1)));
    out.push({
      id: 'missed-calls',
      severity: 'critical',
      title: `Пропущено ${calls.missed} звонков из ${calls.total} — ${calls.missedRate}% обращений`,
      summary: `Хуже всего ${worstDay.day}: ${worstDay.missedRate}% пропусков. После 19:00 не отвечают на ${pct(evening.missed, evening.total)}% звонков. Среднее ожидание ответа — ${calls.avgWait} сек.`,
      evidence: [
        { label: 'Звонков', value: calls.total },
        { label: 'Пропущено', value: `${calls.missed} (${calls.missedRate}%)` },
        { label: 'Целевых от всех звонков', value: `${calls.targetRate}%` },
      ],
      action: `Включить переадресацию на дежурного в вечерние часы и ${worstDay.day}, добавить автоперезвон по пропущенным. Недополученная выручка за период — около ${money(lostRevenue)}.`,
      impact: lostRevenue,
      sources: ['Коллтрекинг'],
    });
  }

  // 7. Поведение на странице: клики без реакции и низкая прокрутка
  const badPage = [...(d.pages || [])].filter((p) => p.visits > 200).sort((a, b) => b.rageRate - a.rageRate)[0];
  if (badPage && badPage.rageRate > 4) {
    out.push({
      id: `page-${slug(badPage.url)}`,
      severity: 'warning',
      title: `«${badPage.title}»: ${badPage.rageRate}% визитов с кликами по неработающим элементам`,
      summary: `До середины страницы доходит ${badPage.scrollRate}% посетителей, среднее время — ${badPage.avgTime}. Форму открывают ${badPage.formStarts} раз, отправляют ${badPage.formSubmits}.`,
      evidence: [
        { label: 'Визиты', value: badPage.visits },
        { label: 'Дочитывания', value: `${badPage.readRate}%` },
        { label: 'Клики впустую', value: badPage.rageClicks },
        { label: 'Конверсия формы', value: `${badPage.formRate}%` },
      ],
      action: 'Посмотреть записи Вебвизора по этой странице: скорее всего, элемент выглядит кликабельным, но им не является, а форма требует лишних полей.',
      impact: 0,
      sources: ['Яндекс.Метрика', 'Вебвизор'],
    });
  }

  // 8. Качество трафика по Метрике
  const worstSource = [...d.metrika.sources].filter((s) => s.visits > 500).sort((a, b) => b.bounceRate - a.bounceRate)[0];
  if (worstSource && worstSource.bounceRate > 40) {
    out.push({
      id: `bounce-${slug(worstSource.source)}`,
      severity: 'info',
      title: `${worstSource.source}: отказы ${worstSource.bounceRate}% при глубине ${worstSource.pageDepth} стр.`,
      summary: `Источник даёт ${worstSource.visits.toLocaleString('ru-RU')} визитов и ${worstSource.leads} заявок (CR ${worstSource.cr}%).`,
      evidence: [
        { label: 'Визиты', value: worstSource.visits },
        { label: 'Отказы', value: `${worstSource.bounceRate}%` },
        { label: 'CR', value: `${worstSource.cr}%` },
      ],
      action: 'Посмотреть Вебвизор по этому источнику: скорее всего, несоответствие обещания на входе и первого экрана.',
      impact: 0,
      sources: ['Яндекс.Метрика'],
    });
  }

  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impact - a.impact).slice(0, 6);
}

/** Короткий дайджест для Telegram руководителю. */
export function buildDigest(d, insights) {
  const kpi = Object.fromEntries(d.kpi.map((k) => [k.id, k]));
  const arrow = (k) => (k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '=');
  const lines = [
    `📊 *Маркетинг · ${fmtDate(d.meta.period.from)} — ${fmtDate(d.meta.period.to)}*`,
    '',
    `Расход: ${money(kpi.spend.value)} (${arrow(kpi.spend)} ${Math.abs(kpi.spend.delta)}%)`,
    `Заявки: ${fmt(kpi.leads.value)} (${arrow(kpi.leads)} ${Math.abs(kpi.leads.delta)}%) · CPL ${money(kpi.cpl.value)} (${arrow(kpi.cpl)} ${Math.abs(kpi.cpl.delta)}%)`,
    `Продажи: ${fmt(kpi.deals.value)} · Выручка ${money(kpi.revenue.value)} · ROMI ${kpi.romi.value}%`,
    '',
    '*Что требует решения:*',
    ...insights.slice(0, 3).map((i, n) => `${n + 1}. ${i.title}\n   → ${i.action}`),
  ];
  return lines.join('\n');
}

/**
 * Инсайты через Claude API. Правила считают цифры, модель — формулирует выводы.
 * @param {object} d нормализованные данные
 * @param {{apiKey:string, model?:string}} cfg
 */
export async function buildAIInsights(d, cfg) {
  const model = cfg.model || 'claude-sonnet-5';
  const facts = buildRuleInsights(d);
  const payload = {
    период: d.meta.period,
    kpi: d.kpi.map(({ id, label, value, delta, plan, planDone }) => ({ id, label, value, delta, plan, planDone })),
    каналы: d.channels,
    кампании: d.campaigns,
    воронка_бота: d.telegram.funnel,
    продажи: d.amo,
    план_факт: d.sheets.planFact,
    найденные_правилами_аномалии: facts,
  };
  const prompt = `Ты — аналитик отдела маркетинга. Ниже выгрузка из Яндекс.Директа, Метрики, Telegram-бота, amoCRM и таблицы с планом.
Дай 4–6 инсайтов для директора по маркетингу. Правила: только выводы, которые подтверждаются цифрами из данных; никаких выдуманных чисел; каждый инсайт — с конкретным действием и оценкой эффекта в рублях, если её можно посчитать.
Верни строго JSON-массив объектов вида:
{"id","severity":"critical|warning|opportunity|info","title","summary","evidence":[{"label","value"}],"action","impact":число,"sources":["..."]}

ДАННЫЕ:
${JSON.stringify(payload, null, 1)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = (json.content || []).map((c) => c.text || '').join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Не удалось разобрать ответ модели как JSON');
  return JSON.parse(match[0]);
}

const bestByRomi = (rows) => [...rows].filter((r) => r.leads > 20).sort((a, b) => b.romi - a.romi)[0];
const slug = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/(^-|-$)/g, '');
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
const fmtDate = (s) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const sumOf = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const avgOf = (rows, k) => (rows.length ? sumOf(rows, k) / rows.length : 0);
