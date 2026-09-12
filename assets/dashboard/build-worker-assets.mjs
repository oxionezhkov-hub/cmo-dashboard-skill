#!/usr/bin/env node
// Собирает страницу дашборда в модуль, который импортирует Cloudflare Worker.
// Запускать после collect.js: node build-worker-assets.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFile(path.join(DIR, f), 'utf8');

const [html, appJs, dataRaw] = await Promise.all([
  read('index.html'), read('app.js'), read('data/dashboard.json'),
]);

const shell = html
  // На хостинге Chart.js берём с CDN — воркер не должен тащить 200 КБ в бандл.
  .replace('<script src="vendor/chart.umd.min.js"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>')
  .replace('<script src="data/dashboard.js"></script>',
    '<script>window.DASHBOARD_CONFIG={askUrl:"/api/dashboard/ask",dataUrl:"/dashboard/data.json"};window.DASHBOARD_DATA=%%DATA%%;</script>')
  .replace('<script src="app.js"></script>', '<script src="/dashboard/app.js"></script>');

const out = `// Файл сгенерирован: node dashboard/build-worker-assets.mjs — руками не править.
export const DASHBOARD_DATA = ${JSON.stringify(JSON.parse(dataRaw))};

export const DASHBOARD_APP_JS = ${JSON.stringify(appJs)};

const SHELL = ${JSON.stringify(shell)};

export function renderDashboardPage(data = DASHBOARD_DATA) {
  return SHELL.replace('%%DATA%%', JSON.stringify(data));
}
`;

await fs.mkdir(path.join(DIR, 'dist'), { recursive: true });
await fs.writeFile(path.join(DIR, 'dist', 'worker-assets.js'), out);
console.log(`• dist/worker-assets.js — ${(out.length / 1024).toFixed(0)} КБ`);
