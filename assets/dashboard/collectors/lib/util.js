// Общие хелперы для коллекторов и генератора демо-данных.

/** Детерминированный PRNG — демо-данные не «прыгают» между запусками. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const round = (n, d = 0) => {
  const p = 10 ** d;
  return Math.round((Number(n) || 0) * p) / p;
};

export const div = (a, b, d = 2) => (b ? round(a / b, d) : 0);

export const pct = (a, b, d = 1) => (b ? round((a / b) * 100, d) : 0);

/** Прирост в процентах текущего периода к прошлому. */
export const delta = (cur, prev, d = 1) => (prev ? round(((cur - prev) / prev) * 100, d) : 0);

export function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Список дат [from..to] включительно. */
export function dateRange(from, to) {
  const out = [];
  for (let d = new Date(from); d <= new Date(to); d = addDays(d, 1)) out.push(isoDate(d));
  return out;
}

export function sum(rows, key) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

/** Мягкая недельная сезонность: будни выше, выходные ниже. */
export function weekdayFactor(dateStr) {
  const day = new Date(dateStr).getUTCDay();
  return [0.62, 1.12, 1.15, 1.1, 1.05, 0.95, 0.6][day];
}
