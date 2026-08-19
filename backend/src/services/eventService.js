const pool = require("../config/db");

async function getAllEvents() {
  const result = await pool.query(`
    SELECT
      id,
      name,
      event_date,
      capacity,
      created_by,
      created_at
    FROM public.events
    ORDER BY event_date ASC
  `);

  return result.rows;
}

async function createEvent({ name, eventDate, capacity, createdBy }) {
  const result = await pool.query(
    `
    INSERT INTO public.events
      (name, event_date, capacity, created_by)
    VALUES
      ($1, $2, $3, $4)
    RETURNING
      id,
      name,
      event_date,
      capacity,
      created_by,
      created_at
    `,
    [name, eventDate, capacity, createdBy]
  );

  return result.rows[0];
}

module.exports = {
  getAllEvents,
  createEvent,
};