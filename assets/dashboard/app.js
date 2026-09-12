/* Отрисовка дашборда. Данные приходят готовой моделью из data/dashboard.js
   (или из /api/dashboard/data, если страницу отдаёт воркер). Здесь только представление:
   пересчёт периода, фильтры, попапы с деталями и запросы к ИИ. */
let D = window.DASHBOARD_DATA;
const CFG = window.DASHBOARD_CONFIG || {};

/* ---------- форматирование ---------- */
const nf = new Intl.NumberFormat('ru-RU');
const num = (n) => nf.format(Math.round(Number(n) || 0));
const dec = (n) => String(n).replace('.', ',');
const money = (n) => `${num(n)} ₽`;
const moneyShort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace('.', ',')} млн ₽`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e3)} тыс ₽`;
  return money(v);
};
const dm = (s) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const dmy = (s) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
const signed = (n) => `${n > 0 ? '+' : ''}${dec(n)}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const pct = (a, b, d = 1) => (b ? Math.round((a / b) * 10 ** (d + 2)) / 10 ** d : 0);
const delta = (a, b, d = 1) => (b ? Math.round(((a - b) / b) * 10 ** (d + 2)) / 10 ** d : 0);

const C = {
  brand: '#2B4ACB', brandSoft: '#C9D3F5', good: '#12805C', bad: '#C4373C',
  warn: '#B7791F', alt: '#5B4BD6', teal: '#0E7C86', ink3: '#8A93A6', line: '#E3E6EE',
};

/* ---------- Chart.js ---------- */
Chart.defaults.font.family = "'Golos Text', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#525B6E';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 7;
Chart.defaults.plugins.legend.labels.padding = 15;
Chart.defaults.plugins.tooltip.backgroundColor = '#101828';
Chart.defaults.plugins.tooltip.padding = 11;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.boxPadding = 5;
Chart.defaults.maintainAspectRatio = false;
const axis = (extra = {}) => ({ grid: { color: C.line, drawTicks: false }, border: { display: false }, ticks: { padding: 8 }, ...extra });
const charts = {};
function draw(id, cfg) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}

/* ---------- состояние ---------- */
const state = { days: 28 };
const fullDays = () => D.daily.length;
const window_ = (rows, days, key = 'date') => {
  const from = D.daily[Math.max(D.daily.length - days, 0)].date;
  return rows.filter((r) => r[key] >= from);
};

/** Вид данных под выбранный период. Всё, что имеет разрез по дням, считается заново. */
function view() {
  const days = Math.min(state.days, fullDays());
  const rows = D.daily.slice(-days);
  const prevRows = D.daily.length >= days * 2 ? D.daily.slice(-days * 2, -days) : null;
  const share = days / fullDays();
  const extra = D.sheets.extraCosts * share;

  const agg = (rs, extraCosts) => {
    const spend = sum(rs, 'spend') + extraCosts;
    const leads = sum(rs, 'leads');
    return {
      spend, leads,
      clicks: sum(rs, 'clicks'), impressions: sum(rs, 'impressions'), visits: sum(rs, 'visits'),
      qualified: sum(rs, 'qualified'), deals: sum(rs, 'deals'), revenue: sum(rs, 'revenue'),
      cpl: leads ? spend / leads : 0,
    };
  };
  const cur = agg(rows, extra);
  const prev = prevRows ? agg(prevRows, extra) : null;
  const full = days === fullDays();

  const kpi = D.kpi.map((k) => {
    if (full) return k;
    const val = {
      spend: cur.spend, leads: cur.leads, cpl: cur.cpl, qualified: cur.qualified,
      qualRate: pct(cur.qualified, cur.leads), deals: cur.deals, revenue: cur.revenue,
      romi: pct(cur.revenue - cur.spend, cur.spend),
    }[k.id];
    const was = prev && {
      spend: prev.spend, leads: prev.leads, cpl: prev.cpl, qualified: prev.qualified,
      qualRate: pct(prev.qualified, prev.leads), deals: prev.deals, revenue: prev.revenue,
      romi: pct(prev.revenue - prev.spend, prev.spend),
    }[k.id];
    return {
      ...k,
      value: Math.round(val * 10) / 10,
      delta: was ? delta(val, was) : k.delta,
      plan: null, planDone: null,
      spark: rows.map((r) => ({
        spend: r.spend, leads: r.leads, cpl: r.cpl, qualified: r.qualified,
        qualRate: pct(r.qualified, r.leads), deals: r.deals, revenue: r.revenue,
        romi: pct(r.revenue - r.spend, r.spend || 1),
      }[k.id])),
    };
  });

  const roll = (source, dim) => {
    const map = new Map();
    for (const r of window_(source, days)) {
      const key = r[dim];
      if (!map.has(key)) map.set(key, { name: key, impressions: 0, clicks: 0, spend: 0, leads: 0, qualified: 0, deals: 0, revenue: 0 });
      const t = map.get(key);
      for (const f of ['impressions', 'clicks', 'spend', 'leads', 'qualified', 'deals', 'revenue']) t[f] += r[f] || 0;
    }
    return [...map.values()];
  };

  const channels = full ? D.channels : roll(D.channelsDaily, 'channel').map((c) => ({
    name: c.name, spend: c.spend, clicks: c.clicks, leads: c.leads, qualified: c.qualified, deals: c.deals, revenue: c.revenue,
    cpl: c.leads ? Math.round(c.spend / c.leads) : 0, cplDelta: 0, qualRate: pct(c.qualified, c.leads),
    romi: c.spend ? pct(c.revenue - c.spend, c.spend) : null, paid: c.spend > 0,
  })).sort((a, b) => b.spend - a.spend);

  const campaigns = full ? D.campaigns : roll(D.campaignsDaily, 'campaign').map((c) => {
    const meta = D.campaigns.find((x) => x.name === c.name) || {};
    return {
      name: c.name, channel: meta.channel || '—', spend: Math.round(c.spend), impressions: c.impressions, clicks: c.clicks,
      ctr: pct(c.clicks, c.impressions, 2), cpc: c.clicks ? Math.round(c.spend / c.clicks) : 0,
      leads: c.leads, cpl: c.leads ? Math.round(c.spend / c.leads) : 0, cplDelta: 0,
      qualified: c.qualified, qualRate: pct(c.qualified, c.leads), deals: c.deals, revenue: c.revenue,
      romi: c.spend ? pct(c.revenue - c.spend, c.spend) : 0,
    };
  }).sort((a, b) => b.spend - a.spend);

  const botDaily = D.telegram.daily.slice(-days);
  const telegram = {
    ...D.telegram,
    daily: botDaily,
    joined: sum(botDaily, 'joined'),
    started: sum(botDaily, 'started'),
    quizCompleted: sum(botDaily, 'quizCompleted'),
    bookedCall: sum(botDaily, 'bookedCall'),
    quizRate: pct(sum(botDaily, 'quizCompleted'), sum(botDaily, 'started')),
    funnel: [
      { stage: 'Подписались на бота', value: sum(botDaily, 'joined') },
      { stage: 'Начали квиз', value: sum(botDaily, 'started') },
      { stage: 'Прошли квиз до конца', value: sum(botDaily, 'quizCompleted') },
      { stage: 'Записались на консультацию', value: sum(botDaily, 'bookedCall') },
    ],
  };

  return {
    days, full, rows, cur, kpi, channels, campaigns, telegram,
    from: rows[0].date, to: rows[rows.length - 1].date,
    funnel: [
      { stage: 'Показы', value: cur.impressions, source: 'реклама' },
      { stage: 'Клики', value: cur.clicks, source: 'реклама' },
      { stage: 'Визиты на сайт', value: cur.visits + cur.clicks, source: 'Метрика' },
      { stage: 'Заявки', value: cur.leads, source: 'CRM' },
      { stage: 'Квал. заявки', value: cur.qualified, source: 'CRM' },
      { stage: 'Продажи', value: cur.deals, source: 'CRM' },
    ],
  };
}

/* ---------- шапка ---------- */
function header(v) {
  document.getElementById('company').textContent = D.meta.company;
  document.getElementById('period').textContent = `${dm(v.from)} — ${dm(v.to)} · ${v.days} дней`;
  document.getElementById('updated').textContent = `обновлено ${new Date(D.meta.generatedAt)
    .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  document.getElementById('kpiHint').textContent = v.full
    ? `сравнение с ${dm(D.meta.comparePeriod.from)} — ${dm(D.meta.comparePeriod.to)}, план месяца из таблицы`
    : `сравнение с предыдущими ${v.days} днями`;
}

/* ---------- KPI ---------- */
function smooth(values, win = 3) {
  return values.map((_, i) => {
    const from = Math.max(0, i - Math.floor(win / 2));
    const slice = values.slice(from, from + win).map((x) => Number(x) || 0);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
function sparkline(values, color) {
  const w = 240, h = 32, pad = 2;
  const vals = smooth(values.map((x) => Number(x) || 0));
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pt = (val, i) => [pad + (i * (w - pad * 2)) / Math.max(vals.length - 1, 1), h - pad - ((val - min) / span) * (h - pad * 2)];
  const line = vals.map((val, i) => pt(val, i).join(',')).join(' L');
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="32" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".2"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="M${line} L${w - pad},${h} L${pad},${h} Z" fill="url(#${id})"/>
    <path d="M${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pt(vals[vals.length - 1], vals.length - 1)[0]}" cy="${pt(vals[vals.length - 1], vals.length - 1)[1]}" r="2.4" fill="${color}"/>
  </svg>`;
}
const kpiValue = (k) => (k.unit === '₽' ? (k.value >= 100000 ? moneyShort(k.value) : money(k.value))
  : k.unit === '%' ? `${dec(k.value)}%` : num(k.value));

function kpis(v) {
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = '';
  v.kpi.forEach((k) => {
    const better = k.good === 'neutral' ? 'flat' : (k.good === 'up' ? k.delta > 0 : k.delta < 0) ? 'up' : k.delta === 0 ? 'flat' : 'down';
    const color = better === 'up' ? C.good : better === 'down' ? C.bad : C.brand;
    const planCls = k.plan ? (k.good === 'down'
      ? (k.planDone <= 100 ? 'ok' : k.planDone <= 115 ? 'warn' : 'bad')
      : (k.planDone >= 95 ? 'ok' : k.planDone >= 75 ? 'warn' : 'bad')) : '';
    const plan = k.plan ? `<div class="planbar">
        <div class="t"><span>план ${k.unit === '₽' ? moneyShort(k.plan) : num(k.plan)}</span><span class="num">${k.planDone}%</span></div>
        <div class="track"><i class="${planCls}" style="width:${Math.min(k.planDone, 100)}%"></i></div></div>` : '';
    grid.appendChild(el(`<div class="card kpi">
      <div class="lab">${k.label}</div>
      <div class="val">${kpiValue(k)}</div>
      <div class="row">
        <span class="pill ${better}">${k.delta > 0 ? '↑' : k.delta < 0 ? '↓' : '='} ${signed(k.delta)}%</span>
        <span class="vs">${v.full ? 'к прошлому периоду' : `к прошлым ${v.days} дн.`}</span>
      </div>
      ${sparkline(k.spark, color)}${plan}</div>`));
  });
}

/* ---------- инсайты ---------- */
const SEV = { critical: 'Требует решения', warning: 'Под контроль', opportunity: 'Точка роста', info: 'К сведению' };
function insightCard(i) {
  return `<div class="card insight ${i.severity}">
    <span class="tag"><b></b>${SEV[i.severity] || i.severity}</span>
    <h4>${i.title}</h4>
    <p>${i.summary}</p>
    <div class="ev">${(i.evidence || []).map((e) => `<span>${e.label}: <b>${e.value}</b></span>`).join('')}</div>
    <div class="act"><span>${i.action}</span></div>
    <div class="foot-row">
      ${i.impact > 0 ? `<div class="impact">Оценка эффекта: <b>${money(i.impact)}</b></div>` : ''}
      <div class="srcs">${(i.sources || []).map((s) => `<span>${s}</span>`).join(' · ')}</div>
    </div></div>`;
}
function insights() {
  const crit = D.insights.filter((i) => i.severity === 'critical').length;
  document.getElementById('insHint').textContent =
    `${D.insights.length} вывода по данным периода${crit ? `, из них ${crit} требуют решения` : ''}`;
  document.getElementById('insGrid').innerHTML = D.insights.slice(0, 4).map(insightCard).join('');
}

/* ---------- воронки ---------- */
function funnel(target, steps, opts = {}) {
  const box = typeof target === 'string' ? document.getElementById(target) : target;
  box.innerHTML = '';
  if (opts.head) box.appendChild(el(`<div class="head-stats">${opts.head.map((h) => `<div><span>${h.l}</span><b>${h.v}</b></div>`).join('')}</div>`));
  const max = Math.max(...steps.map((s) => s.value));
  steps.forEach((s, i) => {
    const prev = i ? steps[i - 1].value : null;
    const width = Math.max((s.value / max) * 100, 5);
    box.appendChild(el(`<div class="fstep">
      <div class="flab">${s.stage}${s.source ? ` <small style="color:var(--ink-3)">· ${s.source}</small>` : ''}</div>
      <div class="fbar"><i style="width:${width}%"></i><span class="${width < 30 ? 'out' : ''}" style="${width < 30 ? `left:calc(${width}% + 10px)` : ''}">${num(s.value)}</span></div>
      <div class="fmeta"><b>${prev ? `${dec(pct(s.value, prev))}%` : (opts.firstLabel || '100%')}</b>${prev ? `<span>−${num(prev - s.value)}</span>` : ''}</div>
    </div>`));
  });
}

/* ---------- динамика ---------- */
function daily(v) {
  draw('chDaily', {
    data: {
      labels: v.rows.map((r) => dm(r.date)),
      datasets: [
        { type: 'bar', label: 'Расход, ₽', data: v.rows.map((r) => r.spend), backgroundColor: C.brandSoft, borderRadius: 4, yAxisID: 'y1', order: 3 },
        { type: 'line', label: 'Заявки', data: v.rows.map((r) => r.leads), borderColor: C.brand, backgroundColor: C.brand, borderWidth: 2.4, tension: .35, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y', order: 1 },
        { type: 'line', label: 'CPL, ₽', data: v.rows.map((r) => r.cpl), borderColor: C.warn, borderWidth: 1.8, borderDash: [5, 4], tension: .35, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y2', order: 2 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: axis({ grid: { display: false } }),
        y: axis({ position: 'left', beginAtZero: true, title: { display: true, text: 'заявки' } }),
        y1: axis({ position: 'right', grid: { display: false }, beginAtZero: true, ticks: { callback: (x) => (x >= 1000 ? `${Math.round(x / 1000)}k` : x) } }),
        y2: { display: false, beginAtZero: true, suggestedMax: Math.max(...v.rows.map((r) => r.cpl)) * 1.8 },
      },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.dataset.yAxisID === 'y' ? num(c.parsed.y) : money(c.parsed.y)}` } } },
    },
  });
  funnel('funnel', v.funnel.slice(2), {
    firstLabel: 'весь трафик',
    head: [
      { l: 'Показы', v: num(v.funnel[0].value) },
      { l: 'Клики', v: num(v.funnel[1].value) },
      { l: 'CTR', v: `${dec(pct(v.funnel[1].value, v.funnel[0].value, 2))}%` },
    ],
  });
}

/* ---------- таблицы ---------- */
function table(target, cols, rows, opts = {}) {
  const t = typeof target === 'string' ? document.getElementById(target) : target;
  const head = cols.map((c) => `<th class="${opts.onSort ? 'sortable' : ''} ${opts.sortKey === c.k ? 'act-sort' : ''}" data-k="${c.k}">${c.t}${
    opts.sortKey === c.k ? (opts.dir === 1 ? ' ↑' : ' ↓') : ''}</th>`).join('');
  const body = rows.length
    ? rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c.k] ?? '—'}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" style="color:var(--ink-3);text-align:center;padding:22px">Под фильтр ничего не попало</td></tr>`;
  t.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  if (opts.onSort) t.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => opts.onSort(th.dataset.k)));
}
const deltaBadge = (d, good = 'up') => (!d ? '' : `<span class="badge ${(good === 'up' ? d > 0 : d < 0) ? 'g' : 'r'}">${signed(d)}%</span>`);
const barCell = (value, max, label, cls = '') =>
  `<div class="bar-cell"><span>${label}</span><span class="bar"><i class="${cls}" style="width:${Math.min((value / max) * 100, 100)}%"></i></span></div>`;

/* ---------- каналы и кампании ---------- */
const CAMPAIGN_COLS = [
  { k: 'name', t: 'Кампания', raw: (c) => c.name },
  { k: 'spend', t: 'Расход', raw: (c) => c.spend },
  { k: 'clicks', t: 'Клики', raw: (c) => c.clicks },
  { k: 'ctr', t: 'CTR', raw: (c) => c.ctr },
  { k: 'cpc', t: 'CPC', raw: (c) => c.cpc },
  { k: 'leads', t: 'Заявки', raw: (c) => c.leads },
  { k: 'cpl', t: 'CPL', raw: (c) => c.cpl },
  { k: 'qualRate', t: 'Квал.', raw: (c) => c.qualRate },
  { k: 'deals', t: 'Продажи', raw: (c) => c.deals },
  { k: 'revenue', t: 'Выручка', raw: (c) => c.revenue },
  { k: 'romi', t: 'ROMI', raw: (c) => c.romi },
];
function campaignRows(list) {
  const maxCpl = Math.max(...list.map((c) => c.cpl), 1);
  return list.map((c) => ({
    name: `<div class="name"><b>${c.name}</b><small>${c.channel}</small></div>`,
    spend: money(c.spend), clicks: num(c.clicks), ctr: `${dec(c.ctr)}%`, cpc: money(c.cpc), leads: num(c.leads),
    cpl: barCell(c.cpl, maxCpl, `${money(c.cpl)} ${deltaBadge(c.cplDelta, 'down')}`,
      c.cpl > maxCpl * 0.6 ? 'red' : c.cpl > maxCpl * 0.35 ? 'amber' : 'green'),
    qualRate: `${dec(c.qualRate)}%`, deals: num(c.deals), revenue: moneyShort(c.revenue),
    romi: `<span class="badge ${c.romi > 100 ? 'g' : c.romi < 0 ? 'r' : 'n'}">${num(c.romi)}%</span>`,
  }));
}
function sortList(list, key, dir) {
  const col = CAMPAIGN_COLS.find((c) => c.k === key) || CAMPAIGN_COLS[1];
  return [...list].sort((a, b) => {
    const va = col.raw(a), vb = col.raw(b);
    return (typeof va === 'string' ? String(va).localeCompare(vb) : va - vb) * dir;
  });
}

function channels(v) {
  draw('chChannels', {
    type: 'bar',
    data: {
      labels: v.channels.map((c) => c.name),
      datasets: [
        { label: 'Расход', data: v.channels.map((c) => c.spend), backgroundColor: C.brandSoft, borderRadius: 4 },
        { label: 'Выручка', data: v.channels.map((c) => c.revenue), backgroundColor: C.good, borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: 'y',
      scales: { x: axis({ beginAtZero: true, ticks: { callback: (x) => (x >= 1e6 ? `${x / 1e6} млн` : x >= 1000 ? `${x / 1000}k` : x) } }), y: axis({ grid: { display: false }, ticks: { autoSkip: false } }) },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.x)}` } } },
    },
  });

  table('tblChannels',
    [{ k: 'name', t: 'Канал' }, { k: 'leads', t: 'Заявки' }, { k: 'cpl', t: 'CPL' }, { k: 'deals', t: 'Продажи' }, { k: 'romi', t: 'ROMI' }],
    v.channels.map((c) => ({
      name: `<div class="name"><b>${c.name}</b><small>${c.paid ? money(c.spend) : 'без прямых затрат'}</small></div>`,
      leads: `${num(c.leads)}`,
      cpl: c.paid ? `${money(c.cpl)} ${v.full ? deltaBadge(c.cplDelta, 'down') : ''}` : '—',
      deals: num(c.deals),
      romi: c.romi === null ? '—' : `<span class="badge ${c.romi > 100 ? 'g' : c.romi < 0 ? 'r' : 'n'}">${num(c.romi)}%</span>`,
    })));

  const paid = v.campaigns.filter((c) => c.spend > 0);
  const render = (key, dir) => table('tblCampaigns', CAMPAIGN_COLS, campaignRows(sortList(paid, key, dir)),
    { sortKey: key, dir, onSort: (k) => render(k, k === key ? -dir : -1) });
  render('spend', -1);
}

/* ---------- сайт ---------- */
function site() {
  const s = D.metrika.sources;
  draw('chSources', {
    type: 'doughnut',
    data: { labels: s.map((x) => x.source), datasets: [{ data: s.map((x) => x.visits), backgroundColor: [C.brand, C.alt, C.teal, C.good, C.warn, '#AAB2C4'], borderWidth: 0, hoverOffset: 5 }] },
    options: { cutout: '64%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => `${c.label}: ${num(c.parsed)} визитов` } } } },
  });
  const maxV = Math.max(...s.map((x) => x.visits));
  table('tblSources',
    [{ k: 'source', t: 'Источник' }, { k: 'visits', t: 'Визиты' }, { k: 'bounce', t: 'Отказы' }, { k: 'depth', t: 'Глубина' }, { k: 'leads', t: 'Заявки' }, { k: 'cr', t: 'CR' }],
    s.map((x) => ({
      source: `<div class="name"><b>${x.source}</b></div>`,
      visits: barCell(x.visits, maxV, num(x.visits)),
      bounce: `<span class="badge ${x.bounceRate > 40 ? 'r' : x.bounceRate > 30 ? 'n' : 'g'}">${dec(x.bounceRate)}%</span>`,
      depth: dec(x.pageDepth), leads: num(x.leads), cr: `${dec(x.cr)}%`,
    })));
  pagesTable('tblPages', D.pages);
}

function pagesTable(target, pages) {
  table(target,
    [{ k: 'page', t: 'Страница' }, { k: 'visits', t: 'Просмотры' }, { k: 'time', t: 'Время' }, { k: 'scroll', t: 'До середины' },
     { k: 'read', t: 'Дочитали' }, { k: 'cta', t: 'Клики по CTA' }, { k: 'form', t: 'Форма' }, { k: 'rage', t: 'Клики впустую' }],
    pages.map((p) => ({
      page: `<div class="name"><b>${p.title}</b><small>${p.url}</small></div>`,
      visits: num(p.visits), time: p.avgTime,
      scroll: `${dec(p.scrollRate)}%`,
      read: `<span class="badge ${p.readRate > 35 ? 'g' : p.readRate > 20 ? 'n' : 'r'}">${dec(p.readRate)}%</span>`,
      cta: `${num(p.ctaClicks)} <span style="color:var(--ink-3)">/ ${dec(p.ctaRate)}%</span>`,
      form: `${num(p.formSubmits)} из ${num(p.formStarts)} <span style="color:var(--ink-3)">/ ${dec(p.formRate)}%</span>`,
      rage: `<span class="badge ${p.rageRate > 4 ? 'r' : 'n'}">${dec(p.rageRate)}%</span>`,
    })));
}

/* ---------- звонки ---------- */
function calls() {
  const c = D.calls;
  draw('chCalls', {
    type: 'bar',
    data: {
      labels: c.byHour.map((h) => `${h.hour}:00`),
      datasets: [
        { label: 'Приняты', data: c.byHour.map((h) => h.total - h.missed), backgroundColor: C.brand, borderRadius: 4, stack: 'a' },
        { label: 'Пропущены', data: c.byHour.map((h) => h.missed), backgroundColor: '#F2C7C8', borderRadius: 4, stack: 'a' },
      ],
    },
    options: { scales: { x: axis({ grid: { display: false } }), y: axis({ beginAtZero: true, stacked: true }) }, scaleShowValues: true },
  });
  document.getElementById('callStats').innerHTML = [
    { l: 'Звонков', v: num(c.total) },
    { l: 'Пропущено', v: `${num(c.missed)} · ${dec(c.missedRate)}%` },
    { l: 'Целевых', v: `${dec(c.targetRate)}%` },
    { l: 'Ожидание ответа', v: `${c.avgWait} сек` },
  ].map((x) => `<div><span>${x.l}</span><b>${x.v}</b></div>`).join('');
  table('tblCallChannels',
    [{ k: 'channel', t: 'Источник звонка' }, { k: 'total', t: 'Звонки' }, { k: 'answered', t: 'Приняты' }, { k: 'target', t: 'Целевые' }],
    c.byChannel.map((x) => ({
      channel: `<div class="name"><b>${x.channel}</b></div>`,
      total: num(x.total), answered: num(x.answered),
      target: `${num(x.target)} <span class="badge ${x.targetRate > 55 ? 'g' : 'n'}">${dec(x.targetRate)}%</span>`,
    })));
}

/* ---------- бот ---------- */
function bot(v) {
  const b = v.telegram;
  draw('chBot', {
    type: 'line',
    data: {
      labels: b.daily.map((d) => dm(d.date)),
      datasets: [
        { label: 'Дошли до конца квиза, %', data: b.daily.map((d) => d.quizRate), borderColor: C.alt, backgroundColor: 'rgba(91,75,214,.10)', fill: true, borderWidth: 2.4, tension: .35, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Записались на консультацию', data: b.daily.map((d) => d.bookedCall), borderColor: C.teal, borderWidth: 1.8, tension: .35, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y1' },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: axis({ grid: { display: false } }), y: axis({ beginAtZero: true, max: 100, ticks: { callback: (x) => `${x}%` } }), y1: axis({ position: 'right', grid: { display: false }, beginAtZero: true }) },
    },
  });
  funnel('botFunnel', b.funnel);
}

/* ---------- продажи ---------- */
function sales() {
  const a = D.amo;
  document.getElementById('amoStats').innerHTML = [
    { l: 'Средний чек', v: money(a.avgCheck), d: `было ${money(a.avgCheckPrev)}` },
    { l: 'Средний цикл сделки', v: `${dec(a.avgCycle)} дн.`, d: `было ${dec(a.avgCyclePrev)} дн.` },
    { l: 'В работе / выиграно / проиграно', v: a.pipeline.map((p) => num(p.count)).join(' · '), d: `выиграно на ${moneyShort(a.pipeline[1].sum)}` },
  ].map((s) => `<div class="card kpi"><div class="lab">${s.l}</div><div class="val">${s.v}</div><div class="row"><span class="vs">${s.d}</span></div></div>`).join('');
  managersTable('tblManagers', a.managers);
  draw('chLost', {
    type: 'bar',
    data: { labels: a.lostReasons.map((r) => r.reason), datasets: [{ data: a.lostReasons.map((r) => r.count), backgroundColor: a.lostReasons.map((r, i) => (i === 0 ? C.bad : C.brandSoft)), borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: axis({ beginAtZero: true }), y: axis({ grid: { display: false }, ticks: { autoSkip: false } }) } },
  });
}
function managersTable(target, list) {
  const a = D.amo;
  table(target,
    [{ k: 'name', t: 'Менеджер' }, { k: 'leads', t: 'Заявки' }, { k: 'deals', t: 'Продажи' }, { k: 'conv', t: 'Конверсия' },
     { k: 'cycle', t: 'Цикл' }, { k: 'no', t: 'Не дозвонились' }, { k: 'rev', t: 'Выручка' }],
    list.map((m) => ({
      name: `<div class="name"><b>${m.name}</b></div>`,
      leads: num(m.leads), deals: num(m.deals), conv: `${dec(m.convRate)}%`,
      cycle: `<span class="badge ${m.avgCycle > a.avgCycle * 1.25 ? 'r' : m.avgCycle < a.avgCycle * 0.9 ? 'g' : 'n'}">${dec(m.avgCycle)} дн.</span>`,
      no: num(m.noAnswer), rev: moneyShort(m.revenue),
    })));
}

/* ---------- план и дайджест ---------- */
function planFact() {
  document.getElementById('planCap').textContent =
    `${new Date(D.meta.period.to).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · факт за ${D.daily.length} дн.`;
  const box = document.getElementById('planRows');
  box.innerHTML = '';
  D.sheets.planFact.forEach((r) => {
    const done = r.done || 0;
    const good = r.good === 'down' ? done <= 100 : done >= 90;
    const fmtv = (x) => (r.metric === 'Выручка' ? moneyShort(x) : r.metric === 'CPL' ? money(x) : num(x));
    box.appendChild(el(`<div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span><b>${r.metric}</b> <span style="color:var(--ink-3)" class="num">${fmtv(r.fact)} из ${fmtv(r.plan)}</span></span>
        <span class="badge ${good ? 'g' : done >= 75 ? 'n' : 'r'}">${done}%</span>
      </div>
      <div class="track"><i class="${good ? 'ok' : done >= 75 ? 'warn' : 'bad'}" style="width:${Math.min(done, 100)}%"></i></div></div>`));
  });
  document.getElementById('digest').textContent = (D.digest || '').replace(/\*/g, '');
  document.getElementById('footNote').innerHTML =
    `Данные за ${dm(D.meta.period.from)} — ${dm(D.meta.period.to)}, собраны ${new Date(D.meta.generatedAt).toLocaleString('ru-RU')}. Суммы в рублях с НДС.`;
}

/* ---------- попапы ---------- */
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalControls = document.getElementById('modalControls');
let modalState = null;

function openModal(kind) {
  const spec = MODALS[kind];
  if (!spec) return;
  modalState = { kind, ...(spec.initial ? spec.initial() : {}) };
  document.getElementById('modalTitle').textContent = spec.title;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  renderModal();
  document.getElementById('modalClose').focus();
}
function closeModal() {
  modal.hidden = true;
  modalState = null;
  document.body.style.overflow = '';
}
function setModal(patch) { Object.assign(modalState, patch); renderModal(); }
function renderModal() {
  const spec = MODALS[modalState.kind];
  const v = view();
  document.getElementById('modalSub').textContent = spec.sub ? spec.sub(v) : '';
  modalControls.innerHTML = '';
  (spec.controls ? spec.controls(v) : []).forEach((c) => modalControls.appendChild(c));
  modalControls.style.display = modalControls.children.length ? '' : 'none';
  modalBody.innerHTML = '';
  spec.render(modalBody, v);
}
function control(label, node) {
  const f = el(`<label class="field"><span>${label}</span></label>`);
  f.appendChild(node);
  return f;
}
function selectField(label, options, value, onChange) {
  const sel = el(`<select>${options.map((o) => `<option value="${o.v}" ${String(o.v) === String(value) ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`);
  sel.addEventListener('change', () => onChange(sel.value));
  return control(label, sel);
}
function searchField(label, value, onInput) {
  const inp = el(`<input type="search" placeholder="поиск" value="${value || ''}">`);
  inp.addEventListener('input', () => onInput(inp.value));
  return control(label, inp);
}
function rangeControl(v) {
  const seg = el(`<div class="seg">${[7, 14, 28].filter((d) => d <= fullDays()).concat(fullDays() > 28 ? [fullDays()] : [])
    .map((d) => `<button data-days="${d}" class="${d === v.days ? 'on' : ''}">${d} дн.</button>`).join('')}</div>`);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setRange(Number(b.dataset.days));
    renderModal();
  });
  return seg;
}
function block(title, cap = '') {
  return el(`<div><h3 style="font-size:14px;margin-bottom:${cap ? '3' : '10'}px">${title}</h3>${
    cap ? `<div class="cap" style="margin-bottom:12px">${cap}</div>` : ''}<div class="tbl-wrap"><table></table></div></div>`);
}
function miniStats(items) {
  return el(`<div class="mini">${items.map((i) => `<div><span>${i.l}</span><b>${i.v}</b></div>`).join('')}</div>`);
}

const MODALS = {
  kpi: {
    title: 'Итоги по дням',
    sub: (v) => `${dm(v.from)} — ${dm(v.to)} · ${v.days} дней · расходы вне рекламных кабинетов распределены равномерно`,
    controls: (v) => [rangeControl(v)],
    render(body, v) {
      body.appendChild(miniStats([
        { l: 'Расход', v: moneyShort(v.cur.spend) }, { l: 'Заявки', v: num(v.cur.leads) },
        { l: 'CPL', v: money(v.cur.cpl) }, { l: 'Продажи', v: num(v.cur.deals) },
        { l: 'Выручка', v: moneyShort(v.cur.revenue) }, { l: 'ROMI', v: `${pct(v.cur.revenue - v.cur.spend, v.cur.spend)}%` },
      ]));
      const b = block('Данные по дням');
      body.appendChild(b);
      table(b.querySelector('table'),
        [{ k: 'date', t: 'Дата' }, { k: 'spend', t: 'Расход' }, { k: 'clicks', t: 'Клики' }, { k: 'leads', t: 'Заявки' },
         { k: 'cpl', t: 'CPL' }, { k: 'qualified', t: 'Квал.' }, { k: 'deals', t: 'Продажи' }, { k: 'revenue', t: 'Выручка' }],
        [...v.rows].reverse().map((r) => ({
          date: new Date(r.date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }),
          spend: money(r.spend), clicks: num(r.clicks), leads: num(r.leads), cpl: money(r.cpl),
          qualified: num(r.qualified), deals: num(r.deals), revenue: r.revenue ? moneyShort(r.revenue) : '—',
        })));
    },
  },

  insights: {
    title: 'Все выводы',
    sub: () => 'фильтр по важности',
    initial: () => ({ sev: 'all' }),
    controls: () => [selectField('Важность', [
      { v: 'all', t: 'Все' }, { v: 'critical', t: 'Требует решения' }, { v: 'warning', t: 'Под контроль' },
      { v: 'opportunity', t: 'Точки роста' }, { v: 'info', t: 'К сведению' },
    ], modalState.sev, (sev) => setModal({ sev }))],
    render(body) {
      const list = D.insights.filter((i) => modalState.sev === 'all' || i.severity === modalState.sev);
      body.appendChild(el(`<div class="ins">${list.map(insightCard).join('') || '<p class="hint-row">Выводов такой важности за период нет</p>'}</div>`));
    },
  },

  dynamics: {
    title: 'Динамика по дням',
    sub: (v) => `${dm(v.from)} — ${dm(v.to)}`,
    initial: () => ({ metric: 'leads' }),
    controls: (v) => [rangeControl(v), selectField('Показатель', [
      { v: 'leads', t: 'Заявки' }, { v: 'spend', t: 'Расход' }, { v: 'cpl', t: 'CPL' },
      { v: 'qualified', t: 'Квал. заявки' }, { v: 'deals', t: 'Продажи' }, { v: 'revenue', t: 'Выручка' },
    ], modalState.metric, (metric) => setModal({ metric }))],
    render(body, v) {
      const m = modalState.metric;
      const labels = { leads: 'Заявки', spend: 'Расход, ₽', cpl: 'CPL, ₽', qualified: 'Квал. заявки', deals: 'Продажи', revenue: 'Выручка, ₽' };
      const wrap = el('<div class="chart"><canvas id="chModalDyn"></canvas></div>');
      body.appendChild(wrap);
      draw('chModalDyn', {
        type: 'line',
        data: { labels: v.rows.map((r) => dm(r.date)), datasets: [{
          label: labels[m], data: v.rows.map((r) => r[m]), borderColor: C.brand,
          backgroundColor: 'rgba(43,74,203,.10)', fill: true, borderWidth: 2.4, tension: .3, pointRadius: 0, pointHoverRadius: 4 }] },
        options: { scales: { x: axis({ grid: { display: false } }), y: axis({ beginAtZero: true }) }, plugins: { legend: { display: false } } },
      });
      const week = {};
      v.rows.forEach((r) => {
        const d = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(r.date).getUTCDay()];
        week[d] ||= { day: d, leads: 0, spend: 0, deals: 0, n: 0 };
        week[d].leads += r.leads; week[d].spend += r.spend; week[d].deals += r.deals; week[d].n++;
      });
      const order = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].filter((d) => week[d]);
      const b = block('Разрез по дням недели', 'помогает увидеть, где заявки есть, а обработки нет');
      body.appendChild(b);
      table(b.querySelector('table'),
        [{ k: 'day', t: 'День' }, { k: 'leads', t: 'Заявки' }, { k: 'spend', t: 'Расход' }, { k: 'cpl', t: 'CPL' }, { k: 'deals', t: 'Продажи' }],
        order.map((d) => ({
          day: d, leads: num(week[d].leads), spend: money(week[d].spend),
          cpl: money(week[d].leads ? week[d].spend / week[d].leads : 0), deals: num(week[d].deals),
        })));
    },
  },

  channels: {
    title: 'Каналы и кампании',
    sub: (v) => `${dm(v.from)} — ${dm(v.to)} · сквозная воронка от клика до продажи`,
    initial: () => ({ channel: 'all', q: '', minSpend: 0, sort: 'spend', dir: -1 }),
    controls: (v) => [
      rangeControl(v),
      selectField('Канал', [{ v: 'all', t: 'Все каналы' }, ...v.channels.filter((c) => c.paid).map((c) => ({ v: c.name, t: c.name }))],
        modalState.channel, (channel) => setModal({ channel })),
      selectField('Расход от', [{ v: 0, t: 'любой' }, { v: 50000, t: '50 тыс ₽' }, { v: 150000, t: '150 тыс ₽' }, { v: 300000, t: '300 тыс ₽' }],
        modalState.minSpend, (minSpend) => setModal({ minSpend: Number(minSpend) })),
      searchField('Поиск', modalState.q, (q) => setModal({ q })),
    ],
    render(body, v) {
      const fb = block('Воронка по каналам', 'клики → заявки → квалификация → продажи');
      body.appendChild(fb);
      table(fb.querySelector('table'),
        [{ k: 'name', t: 'Канал' }, { k: 'clicks', t: 'Клики' }, { k: 'leads', t: 'Заявки' }, { k: 'cr1', t: 'Клик → заявка' },
         { k: 'qualified', t: 'Квал.' }, { k: 'cr2', t: 'Заявка → квал.' }, { k: 'deals', t: 'Продажи' }, { k: 'cr3', t: 'Квал. → продажа' }, { k: 'cac', t: 'Цена продажи' }],
        v.channels.map((c) => ({
          name: `<div class="name"><b>${c.name}</b></div>`,
          clicks: c.clicks ? num(c.clicks) : '—', leads: num(c.leads),
          cr1: c.clicks ? `${dec(pct(c.leads, c.clicks, 2))}%` : '—',
          qualified: num(c.qualified), cr2: `${dec(pct(c.qualified, c.leads))}%`,
          deals: num(c.deals), cr3: `${dec(pct(c.deals, c.qualified))}%`,
          cac: c.spend && c.deals ? money(c.spend / c.deals) : '—',
        })));

      const list = v.campaigns.filter((c) => c.spend > 0)
        .filter((c) => modalState.channel === 'all' || c.channel === modalState.channel)
        .filter((c) => c.spend >= modalState.minSpend)
        .filter((c) => !modalState.q || c.name.toLowerCase().includes(modalState.q.toLowerCase()));
      const cb = block('Кампании', `${list.length} из ${v.campaigns.filter((c) => c.spend > 0).length} · сортировка по клику на заголовок`);
      body.appendChild(cb);
      const render = (key, dir) => table(cb.querySelector('table'), CAMPAIGN_COLS, campaignRows(sortList(list, key, dir)),
        { sortKey: key, dir, onSort: (k) => { modalState.sort = k; modalState.dir = k === key ? -dir : -1; render(modalState.sort, modalState.dir); } });
      render(modalState.sort, modalState.dir);
    },
  },

  site: {
    title: 'Сайт и поведение на страницах',
    sub: () => `${dm(D.meta.period.from)} — ${dm(D.meta.period.to)} · поведение считается за весь период`,
    initial: () => ({ sort: 'visits', q: '' }),
    controls: () => [
      selectField('Сортировка', [
        { v: 'visits', t: 'по просмотрам' }, { v: 'rageRate', t: 'по кликам впустую' },
        { v: 'readRate', t: 'по дочитываниям' }, { v: 'submitRate', t: 'по конверсии в заявку' },
      ], modalState.sort, (sort) => setModal({ sort })),
      searchField('Поиск', modalState.q, (q) => setModal({ q })),
    ],
    render(body) {
      const pages = [...D.pages]
        .filter((p) => !modalState.q || (p.title + p.url).toLowerCase().includes(modalState.q.toLowerCase()))
        .sort((a, b) => b[modalState.sort] - a[modalState.sort]);
      body.appendChild(miniStats([
        { l: 'Визитов на сайте', v: num(D.metrika.visits) },
        { l: 'Просмотров страниц', v: num(sum(D.pages, 'visits')) },
        { l: 'Среднее время', v: mmss(D.pages.reduce((a, p) => a + p.avgTimeSec, 0) / D.pages.length) },
        { l: 'Дочитывают', v: `${dec(pct(sum(D.pages, 'scroll100'), sum(D.pages, 'visits')))}%` },
      ]));
      const b = block('Страницы');
      body.appendChild(b);
      pagesTable(b.querySelector('table'), pages);
      const sb = block('Глубина прокрутки', 'сколько посетителей доходит до каждой отметки');
      body.appendChild(sb);
      table(sb.querySelector('table'),
        [{ k: 'page', t: 'Страница' }, { k: 's50', t: 'до 50%' }, { k: 's75', t: 'до 75%' }, { k: 's100', t: 'до конца' }, { k: 'form', t: 'Заявок со страницы' }],
        pages.map((p) => ({
          page: `<div class="name"><b>${p.title}</b><small>${p.url}</small></div>`,
          s50: barCell(pct(p.scroll50, p.visits), 100, `${dec(pct(p.scroll50, p.visits))}%`),
          s75: barCell(pct(p.scroll75, p.visits), 100, `${dec(pct(p.scroll75, p.visits))}%`),
          s100: barCell(p.readRate, 100, `${dec(p.readRate)}%`, p.readRate < 20 ? 'red' : ''),
          form: `${num(p.formSubmits)} <span style="color:var(--ink-3)">/ ${dec(p.submitRate)}%</span>`,
        })));
    },
  },

  calls: {
    title: 'Звонки',
    sub: () => `${dm(D.meta.period.from)} — ${dm(D.meta.period.to)} · данные коллтрекинга за весь период`,
    render(body) {
      const c = D.calls;
      body.appendChild(miniStats([
        { l: 'Звонков', v: num(c.total) }, { l: 'Принято', v: num(c.answered) },
        { l: 'Пропущено', v: `${num(c.missed)} · ${dec(c.missedRate)}%` },
        { l: 'Целевых', v: `${dec(c.targetRate)}%` },
        { l: 'Ожидание ответа', v: `${c.avgWait} сек` }, { l: 'Средний разговор', v: mmss(c.avgTalk) },
      ]));
      const d = block('По дням недели', 'видно, когда звонки принимать некому');
      body.appendChild(d);
      table(d.querySelector('table'),
        [{ k: 'day', t: 'День' }, { k: 'total', t: 'Звонки' }, { k: 'missed', t: 'Пропущено' }, { k: 'rate', t: 'Доля пропусков' }],
        c.byWeekday.map((x) => ({
          day: x.day, total: num(x.total), missed: num(x.missed),
          rate: barCell(x.missedRate, 100, `${dec(x.missedRate)}%`, x.missedRate > 30 ? 'red' : x.missedRate > 15 ? 'amber' : 'green'),
        })));
      const h = block('По часам');
      body.appendChild(h);
      table(h.querySelector('table'),
        [{ k: 'hour', t: 'Час' }, { k: 'total', t: 'Звонки' }, { k: 'missed', t: 'Пропущено' }, { k: 'rate', t: 'Доля пропусков' }],
        c.byHour.map((x) => ({
          hour: `${x.hour}:00`, total: num(x.total), missed: num(x.missed),
          rate: `<span class="badge ${pct(x.missed, x.total) > 30 ? 'r' : 'n'}">${dec(pct(x.missed, x.total))}%</span>`,
        })));
    },
  },

  bot: {
    title: 'Telegram-бот',
    sub: (v) => `${dm(v.from)} — ${dm(v.to)}`,
    controls: (v) => [rangeControl(v)],
    render(body, v) {
      const b = v.telegram;
      body.appendChild(miniStats([
        { l: 'Подписались', v: num(b.joined) }, { l: 'Начали квиз', v: num(b.started) },
        { l: 'Прошли квиз', v: num(b.quizCompleted) }, { l: 'Записались', v: num(b.bookedCall) },
        { l: 'Конверсия в квиз', v: `${dec(b.quizRate)}%` },
      ]));
      const t = block('По дням');
      body.appendChild(t);
      table(t.querySelector('table'),
        [{ k: 'date', t: 'Дата' }, { k: 'joined', t: 'Подписки' }, { k: 'started', t: 'Начали квиз' },
         { k: 'quiz', t: 'Прошли' }, { k: 'rate', t: 'Конверсия' }, { k: 'booked', t: 'Записались' }],
        [...b.daily].reverse().map((d) => ({
          date: dmy(d.date), joined: num(d.joined), started: num(d.started), quiz: num(d.quizCompleted),
          rate: `<span class="badge ${d.quizRate < 40 ? 'r' : d.quizRate > 60 ? 'g' : 'n'}">${dec(d.quizRate)}%</span>`,
          booked: num(d.bookedCall),
        })));
    },
  },

  sales: {
    title: 'Продажи',
    sub: () => `${dm(D.meta.period.from)} — ${dm(D.meta.period.to)} · данные CRM за весь период`,
    initial: () => ({ manager: 'all' }),
    controls: () => [selectField('Менеджер', [{ v: 'all', t: 'Все' }, ...D.amo.managers.map((m) => ({ v: m.name, t: m.name }))],
      modalState.manager, (manager) => setModal({ manager }))],
    render(body) {
      const list = D.amo.managers.filter((m) => modalState.manager === 'all' || m.name === modalState.manager);
      body.appendChild(miniStats([
        { l: 'Заявок', v: num(sum(list, 'leads')) }, { l: 'Квалифицировано', v: num(sum(list, 'qualified')) },
        { l: 'Продаж', v: num(sum(list, 'deals')) }, { l: 'Выручка', v: moneyShort(sum(list, 'revenue')) },
        { l: 'Средний чек', v: money(D.amo.avgCheck) }, { l: 'Средний цикл', v: `${dec(D.amo.avgCycle)} дн.` },
      ]));
      const m = block('Менеджеры');
      body.appendChild(m);
      managersTable(m.querySelector('table'), list);
      const p = block('Этапы воронки в CRM');
      body.appendChild(p);
      table(p.querySelector('table'),
        [{ k: 'stage', t: 'Этап' }, { k: 'count', t: 'Сделок' }, { k: 'sum', t: 'Сумма' }],
        D.amo.pipeline.map((x) => ({ stage: x.stage, count: num(x.count), sum: x.sum ? moneyShort(x.sum) : '—' })));
      const l = block('Причины отказов');
      body.appendChild(l);
      table(l.querySelector('table'),
        [{ k: 'reason', t: 'Причина' }, { k: 'count', t: 'Сделок' }, { k: 'share', t: 'Доля' }],
        D.amo.lostReasons.map((x) => ({
          reason: x.reason, count: num(x.count),
          share: barCell(x.count, D.amo.lostReasons[0].count, `${dec(pct(x.count, sum(D.amo.lostReasons, 'count')))}%`),
        })));
    },
  },

  plan: {
    title: 'План и прогноз',
    sub: () => `${new Date(D.meta.period.to).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · факт за ${D.daily.length} дн.`,
    render(body) {
      const days = D.daily.length;
      const b = block('Выполнение и прогноз на месяц', 'прогноз считается по текущему темпу');
      body.appendChild(b);
      table(b.querySelector('table'),
        [{ k: 'metric', t: 'Показатель' }, { k: 'fact', t: 'Факт' }, { k: 'plan', t: 'План' }, { k: 'done', t: 'Выполнено' },
         { k: 'forecast', t: 'Прогноз на месяц' }, { k: 'gap', t: 'Разрыв' }],
        D.sheets.planFact.map((r) => {
          const fmtv = (x) => (r.metric === 'Выручка' ? moneyShort(x) : r.metric === 'CPL' ? money(x) : num(x));
          const forecast = r.metric === 'CPL' ? r.fact : (r.fact / days) * 30;
          const gap = forecast - r.plan;
          const good = r.good === 'down' ? gap <= 0 : gap >= 0;
          return {
            metric: r.metric, fact: fmtv(r.fact), plan: fmtv(r.plan),
            done: `<span class="badge ${(r.good === 'down' ? r.done <= 100 : r.done >= 90) ? 'g' : 'r'}">${r.done}%</span>`,
            forecast: fmtv(forecast),
            gap: `<span class="badge ${good ? 'g' : 'r'}">${gap > 0 ? '+' : ''}${fmtv(Math.abs(gap)).replace(/^/, gap < 0 ? '−' : '')}</span>`,
          };
        }));
      const c = block('Расходы вне рекламных кабинетов', 'из таблицы отдела');
      body.appendChild(c);
      table(c.querySelector('table'),
        [{ k: 'channel', t: 'Статья' }, { k: 'spend', t: 'Расход' }],
        D.sheets.costs.map((x) => ({ channel: x.channel, spend: money(x.spend) })));
      body.appendChild(el(`<div class="hint-row">Всего вне кабинетов: ${money(D.sheets.extraCosts)} · эти деньги входят в общий расход и CPL.</div>`));
    },
  },
};

/* ---------- источники ---------- */
const LINEAGE = [
  ['Расход, клики, показы, кампании', 'Яндекс.Директ', 'Reports API v5, отчёт по кампаниям'],
  ['Кампании ВКонтакте', 'VK Ads', 'API статистики по дням'],
  ['Кампании в Telegram', 'Telegram Ads', 'выгрузка кабинета в таблицу'],
  ['Визиты, отказы, глубина, источники', 'Яндекс.Метрика', 'Reporting API, метрики ym:s:*'],
  ['Прокрутка, клики и формы на страницах', 'Вебвизор и страницы', 'отчёт по ym:pv:* и цели счётчика'],
  ['Звонки, пропуски, целевые обращения', 'Коллтрекинг', 'журнал звонков за период'],
  ['Воронка бота: /start → квиз → запись', 'Telegram-бот', 'события бота + Bot API'],
  ['Заявки, квалификация, сделки, выручка', 'amoCRM', 'API v4, сделки по дате создания'],
  ['План месяца и расходы вне кабинетов', 'Google Sheets', 'Sheets API v4'],
  ['Выводы и дайджест', 'Claude API', 'правила считают, модель формулирует'],
];
function pipelineTable() {
  const st = Object.fromEntries(D.sources.map((s) => [s.name, s]));
  table('tblPipeline',
    [{ k: 'block', t: 'Блок дашборда' }, { k: 'src', t: 'Источник' }, { k: 'how', t: 'Как забираем' }, { k: 'status', t: 'Статус' }],
    LINEAGE.map(([block, src, how]) => ({
      block: `<div class="name"><b>${block}</b></div>`,
      src: `<span style="font-family:var(--sans)">${src}</span>`,
      how: `<span style="font-family:var(--sans);color:var(--ink-2)">${how}</span>`,
      status: st[src]
        ? `<span class="badge ${st[src].status === 'error' ? 'r' : st[src].status === 'off' ? 'n' : 'g'}">${
            st[src].status === 'error' ? 'ошибка' : st[src].status === 'off' ? 'выключен' : st[src].rows ? `${num(st[src].rows)} строк` : 'на связи'}</span>`
        : '<span class="badge n">—</span>',
    })));
}

/* ---------- запросы к ИИ ---------- */
const QUICK = [
  'Куда переложить бюджет в следующем месяце и почему?',
  'Что мешает выполнить план по продажам?',
  'Какие каналы дают продажи, а какие только заявки?',
  'Где мы теряем больше всего денег прямо сейчас?',
];
function ask() {
  const input = document.getElementById('askInput');
  const answer = document.getElementById('askAnswer');
  const btn = document.getElementById('askBtn');
  const hint = document.getElementById('askHint');
  document.getElementById('askQuick').innerHTML = QUICK.map((q) => `<button type="button">${q}</button>`).join('');
  document.getElementById('askQuick').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    input.value = b.textContent;
    input.focus();
  });

  btn.addEventListener('click', async () => {
    const question = input.value.trim();
    if (!question) { input.focus(); return; }
    btn.disabled = true;
    hint.textContent = 'Считаю по данным периода…';
    answer.textContent = '';
    try {
      const res = await fetch(CFG.askUrl || '/api/dashboard/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, period: D.meta.period }),
      });
      if (!res.ok) throw new Error(`сервис ответил ${res.status}`);
      const data = await res.json();
      answer.textContent = data.answer || 'Пустой ответ';
      hint.textContent = '';
    } catch (err) {
      hint.textContent = '';
      answer.textContent = `Не удалось получить ответ: ${err.message}. Запросы к ИИ работают на опубликованной версии дашборда, где настроен ключ.`;
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- обновление данных ---------- */
function refresh() {
  const btn = document.getElementById('refreshBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const was = btn.textContent;
    btn.textContent = 'Обновляю…';
    try {
      const res = await fetch(`${CFG.dataUrl || 'data/dashboard.json'}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      D = await res.json();
      renderAll();
      btn.textContent = was;
    } catch {
      btn.textContent = 'Не обновилось';
      setTimeout(() => { btn.textContent = was; }, 2500);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- сборка ---------- */
function renderAll() {
  const v = view();
  header(v);
  kpis(v);
  insights();
  daily(v);
  channels(v);
  site();
  calls();
  bot(v);
  sales();
  planFact();
  pipelineTable();
}

function setRange(days) {
  state.days = days;
  document.querySelectorAll('#globalRange button').forEach((b) => b.classList.toggle('on', Number(b.dataset.days) === days));
  const v = view();
  header(v);
  kpis(v);
  daily(v);
  channels(v);
  bot(v);
}

renderAll();
ask();
refresh();

document.getElementById('globalRange').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setRange(Number(b.dataset.days));
});
document.querySelectorAll('[data-modal]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.modal)));
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
