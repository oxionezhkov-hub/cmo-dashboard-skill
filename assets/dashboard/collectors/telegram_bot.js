// Telegram-бот. В Bot API нет аналитики воронки — её отдаёт сам бот.
// Ожидаемый контракт: GET {eventsUrl}?from=YYYY-MM-DD&to=YYYY-MM-DD
// -> [{date, joined, left, started, quizCompleted, bookedCall}]
// (в этом репозитории такой эндпоинт легко поднять на воркере поверх KV).
// Плюс подтягиваем размер канала через Bot API.
import { request } from './lib/http.js';

export async function fetchTelegram({ botToken, eventsUrl, eventsSecret, channelId }, period) {
  const daily = eventsUrl
    ? (await request(`${eventsUrl}?from=${period.from}&to=${period.to}`, {
        headers: eventsSecret ? { Authorization: `Bearer ${eventsSecret}` } : {},
      })).data
    : [];

  let subscribers = null;
  if (botToken && channelId) {
    const res = await request(`https://api.telegram.org/bot${botToken}/getChatMemberCount?chat_id=${encodeURIComponent(channelId)}`);
    subscribers = res.data?.result ?? null;
  }
  return { daily: daily.map(normalizeDay), subscribers };
}

const normalizeDay = (d) => ({
  date: d.date,
  joined: Number(d.joined || 0),
  left: Number(d.left || 0),
  started: Number(d.started || 0),
  quizCompleted: Number(d.quizCompleted || d.quiz || 0),
  bookedCall: Number(d.bookedCall || d.booked || 0),
});
