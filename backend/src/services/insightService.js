const pool = require("../config/db");

async function getEventStats(eventId) {
  const result = await pool.query(
    `
    SELECT
      e.name,
      e.capacity,
      count(DISTINCT r.id)::int AS registered_count,
      count(DISTINCT c.id)::int AS checked_in_count,
      count(DISTINCT r.id) - count(DISTINCT c.id) AS no_show_count,
      COALESCE((
        SELECT to_char(date_trunc('hour', peak.checked_in_at), 'HH12:MI AM')
        FROM public.checkins peak
        JOIN public.registrations peak_registration ON peak_registration.id = peak.registration_id
        WHERE peak_registration.event_id = e.id
        GROUP BY date_trunc('hour', peak.checked_in_at)
        ORDER BY count(*) DESC, date_trunc('hour', peak.checked_in_at) ASC
        LIMIT 1
      ), 'No check-ins yet') AS peak_checkin_hour
    FROM public.events e
    LEFT JOIN public.registrations r ON r.event_id = e.id
    LEFT JOIN public.checkins c ON c.registration_id = r.id
    WHERE e.id = $1
    GROUP BY e.id, e.name, e.capacity
    `,
    [eventId]
  );

  if (result.rowCount === 0) throw new Error("Event not found");
  const row = result.rows[0];
  const registeredCount = Number(row.registered_count);
  const checkedInCount = Number(row.checked_in_count);
  return {
    eventName: row.name,
    capacity: Number(row.capacity),
    registeredCount,
    checkedInCount,
    noShowCount: Number(row.no_show_count),
    spotsLeft: Number(row.capacity) - registeredCount,
    noShowPercentage: registeredCount ? Math.round((Number(row.no_show_count) / registeredCount) * 100) : 0,
    peakCheckinHour: row.peak_checkin_hour,
  };
}

function fallbackAnswer(question, stats) {
  const normalized = question.toLowerCase().replaceAll("-", " ");
  const asksCheckedIn = /checked\s*in|check\s*ins|arrived|attendance/.test(normalized);
  const asksRegistered = /registered|registration|signed up|sign ups/.test(normalized);
  const asksNoShows = /no\s*shows?|absent|didn.t arrive/.test(normalized);
  const asksPeak = /peak|busiest|highest.*(traffic|attendance|check)/.test(normalized);
  const asksSpots = /spots?|seats?|capacity|available|availability|vacanc(y|ies)|remaining|left/.test(normalized);

  if (asksNoShows && /percentage|percent|rate|how many/.test(normalized)) {
    return `${stats.noShowPercentage}% of registered attendees are currently no-shows.`;
  }
  if (asksPeak && asksCheckedIn) return `Check-ins peaked around ${stats.peakCheckinHour}.`;
  if (asksSpots) return stats.spotsLeft === 0
    ? "There are no vacancies left; this event is full."
    : `${stats.spotsLeft} vacancies are available.`;
  if (asksCheckedIn) return `${stats.checkedInCount} people have checked in so far.`;
  if (asksRegistered) return `${stats.registeredCount} people are registered.`;
  if (asksNoShows) return `${stats.noShowCount} registered attendees are currently no-shows.`;
  return "I can answer questions about registered attendees, check-ins, no-shows, peak check-in time, and remaining spots.";
}

async function answerInsight(question, stats) {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return { answer: fallbackAnswer(question, stats), fallback: true, stats };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const instruction = "Answer only from the provided event statistics. Never invent or alter numbers. If the question is unrelated, say so.";
    const context = JSON.stringify({ question, statistics: stats });

    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instruction }] },
            contents: [{ role: "user", parts: [{ text: context }] }],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
      const data = await response.json();
      return {
        answer: data.candidates?.[0]?.content?.parts?.[0]?.text || fallbackAnswer(question, stats),
        fallback: false,
        stats,
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: context },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const data = await response.json();
    return { answer: data.choices?.[0]?.message?.content || fallbackAnswer(question, stats), fallback: false, stats };
  } catch {
    return { answer: fallbackAnswer(question, stats), fallback: true, stats };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getEventStats, answerInsight };