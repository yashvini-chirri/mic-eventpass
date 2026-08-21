const crypto = require("crypto");
const pool = require("../config/db");

function hashQrToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function registerForEvent(eventId, attendeeId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const eventResult = await client.query(
      `
      SELECT id, capacity
      FROM public.events
      WHERE id = $1
      FOR UPDATE
      `,
      [eventId]
    );

    if (eventResult.rowCount === 0) {
      throw new Error("Event not found");
    }

    const duplicateResult = await client.query(
      `
      SELECT id
      FROM public.registrations
      WHERE event_id = $1 AND attendee_id = $2
      `,
      [eventId, attendeeId]
    );

    if (duplicateResult.rowCount > 0) {
      throw new Error("Already registered");
    }

    const countResult = await client.query(
      `
      SELECT count(*)::int AS count
      FROM public.registrations
      WHERE event_id = $1
      `,
      [eventId]
    );

    if (countResult.rows[0].count >= Number(eventResult.rows[0].capacity)) {
      throw new Error("Event is full");
    }

    const registrationResult = await client.query(
      `
      INSERT INTO public.registrations (event_id, attendee_id)
      VALUES ($1, $2)
      RETURNING id, event_id, attendee_id, registered_at, status
      `,
      [eventId, attendeeId]
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashQrToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(
      `
      INSERT INTO public.qr_tokens (registration_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      `,
      [registrationResult.rows[0].id, tokenHash, expiresAt]
    );

    await client.query("COMMIT");

    return {
      ...registrationResult.rows[0],
      qrToken: rawToken,
      qrTokenExpiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkInWithQrToken({ rawToken, checkedInBy, idempotencyKey, source }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
      SELECT
        qr.id,
        qr.registration_id,
        r.event_id,
        qr.expires_at,
        qr.used_at,
        c.checked_in_at
      FROM public.qr_tokens qr
      JOIN public.registrations r ON r.id = qr.registration_id
      LEFT JOIN public.checkins c ON c.registration_id = qr.registration_id
      WHERE qr.token_hash = $1
      FOR UPDATE OF qr
      `,
      [hashQrToken(rawToken)]
    );

    if (tokenResult.rowCount === 0) {
      throw new Error("Invalid QR token");
    }

    const token = tokenResult.rows[0];

    if (token.used_at || token.checked_in_at) {
      const checkedInAt = token.checked_in_at || token.used_at;
      throw new Error(`Already checked in at ${new Date(checkedInAt).toISOString()}`);
    }

    if (new Date(token.expires_at) <= new Date()) {
      throw new Error("QR token expired");
    }

    const checkinResult = await client.query(
      `
      INSERT INTO public.checkins
        (registration_id, checked_in_by, source, idempotency_key)
      VALUES ($1, $2, $3, $4)
      RETURNING id, registration_id, checked_in_at, source
      `,
      [token.registration_id, checkedInBy, source || "online", idempotencyKey || null]
    );

    await client.query(
      `
      UPDATE public.qr_tokens
      SET used_at = now()
      WHERE id = $1
      `,
      [token.id]
    );

    await client.query("COMMIT");
    return { ...checkinResult.rows[0], eventId: token.event_id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

async function getEventDashboard(eventId) {
  const result = await pool.query(
    `
    SELECT
      e.id AS event_id,
      e.name AS event_name,
      e.capacity,
      r.id AS registration_id,
      p.name AS attendee_name,
      p.email AS attendee_email,
      r.registered_at,
      c.checked_in_at
    FROM public.events e
    LEFT JOIN public.registrations r ON r.event_id = e.id
    LEFT JOIN public.profiles p ON p.id = r.attendee_id
    LEFT JOIN public.checkins c ON c.registration_id = r.id
    WHERE e.id = $1
    ORDER BY r.registered_at DESC NULLS LAST
    `,
    [eventId]
  );

  if (result.rowCount === 0) {
    throw new Error("Event not found");
  }

  const firstRow = result.rows[0];
  const attendees = result.rows
    .filter((row) => row.registration_id)
    .map((row) => ({
      registrationId: row.registration_id,
      name: row.attendee_name,
      email: row.attendee_email,
      registeredAt: row.registered_at,
      checkedInAt: row.checked_in_at,
    }));

  return {
    eventId: firstRow.event_id,
    eventName: firstRow.event_name,
    capacity: Number(firstRow.capacity),
    registeredCount: attendees.length,
    checkedInCount: attendees.filter((attendee) => attendee.checkedInAt).length,
    attendees,
  };
}

async function getEventExport(eventId) {
  const result = await pool.query(
    `
    SELECT p.name AS attendee_name, p.email AS attendee_email,
      r.registered_at, c.checked_in_at
    FROM public.registrations r
    JOIN public.profiles p ON p.id = r.attendee_id
    LEFT JOIN public.checkins c ON c.registration_id = r.id
    WHERE r.event_id = $1
    ORDER BY r.registered_at ASC
    `,
    [eventId]
  );
  return result.rows;
}

module.exports = {
  registerForEvent,
  checkInWithQrToken,
  getEventDashboard,
  getEventExport,
  getRegistrations,
};