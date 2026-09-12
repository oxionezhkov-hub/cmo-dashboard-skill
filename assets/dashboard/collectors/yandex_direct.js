// Яндекс.Директ — Reports API v5 (https://yandex.ru/dev/direct/doc/reports/reports.html).
// Токен: OAuth-токен приложения с доступом к Директу. Для агентства нужен Client-Login.
import { request, parseTsv, sleep } from './lib/http.js';

const ENDPOINT = 'https://api.direct.yandex.com/json/v5/reports';
const FIELDS = ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost'];

export async function fetchDirect({ token, clientLogin }, period) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Accept-Language': 'ru',
    'processingMode': 'auto',
    'returnMoneyInMicros': 'false',
    'skipReportHeader': 'true',
    'skipColumnHeader': 'true',
    'skipReportSummary': 'true',
    'Content-Type': 'application/json; charset=utf-8',
    ...(clientLogin ? { 'Client-Login': clientLogin } : {}),
  };
  const body = JSON.stringify({
    params: {
      SelectionCriteria: { DateFrom: period.from, DateTo: period.to },
      FieldNames: FIELDS,
      ReportName: `dash-${period.from}-${period.to}-${Date.now()}`,
      ReportType: 'CAMPAIGN_PERFORMANCE_REPORT',
      DateRangeType: 'CUSTOM_DATE',
      Format: 'TSV',
      IncludeVAT: 'YES',
    },
  });

  // 200 — отчёт готов; 201/202 — ставится в очередь, надо повторить запрос.
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await request(ENDPOINT, { method: 'POST', headers, body, expect: 'text' });
    if (res.status === 200) {
      return parseTsv(res.text, FIELDS).map((r) => ({
        date: r.Date,
        campaignId: Number(r.CampaignId),
        campaign: r.CampaignName,
        impressions: Number(r.Impressions),
        clicks: Number(r.Clicks),
        spend: Number(r.Cost),
      }));
    }
    await sleep(Number(res.headers.get('retryIn') || 5) * 1000);
  }
  throw new Error('Директ: отчёт не сформировался за отведённое время');
}
