const pool = require("../config/db");

async function registerForEvent(eventId, attendeeId) {
  const result = await pool.query(
    `
    SELECT *
    FROM public.register_for_event($1, $2)
    `,
    [eventId, attendeeId]
  );

  return result.rows[0];
}

async function getRegistrations() {
  const result = await pool.query(`
    SELECT
      id,
      event_id,
      attendee_id,
      status,
      registered_at
    FROM public.registrations
    ORDER BY registered_at DESC
  `);

  return result.rows;
}

module.exports = {
  registerForEvent,
  getRegistrations,
};