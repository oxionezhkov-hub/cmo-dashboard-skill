// Тонкая обёртка над fetch: ретраи, таймаут, понятные ошибки.
export async function request(url, { method = 'GET', headers = {}, body, retries = 3, timeout = 30000, expect = 'json' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, { method, headers, body, signal: ac.signal });
      clearTimeout(timer);
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw new HttpError(res.status, text, url);
      if (!res.ok) throw new HttpError(res.status, text, url, false);
      if (expect === 'text') return { status: res.status, text, headers: res.headers };
      return { status: res.status, data: text ? JSON.parse(text) : null, text, headers: res.headers };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof HttpError && err.retryable === false) throw err;
      if (attempt === retries) break;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(status, body, url, retryable = true) {
    super(`HTTP ${status} ${url}\n${String(body).slice(0, 500)}`);
    this.status = status; this.body = body; this.url = url; this.retryable = retryable;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** TSV из отчётов Директа -> массив объектов. */
export function parseTsv(text, columns) {
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(columns.map((c, i) => [c, cells[i]]));
  });
}
