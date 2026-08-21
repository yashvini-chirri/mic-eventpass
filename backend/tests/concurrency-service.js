require("dotenv").config();

const pool = require("../src/config/db");
const registrationService = require("../src/services/registrationService");

async function main() {
  const organizerResult = await pool.query(
    "SELECT id FROM public.profiles WHERE role = $1 LIMIT 1",
    ["organizer"]
  );
  const profilesResult = await pool.query(
    "SELECT id FROM public.profiles ORDER BY id LIMIT 100"
  );

  if (!organizerResult.rows[0] || profilesResult.rows.length < 100) {
    throw new Error("At least one organizer and 100 profiles are required");
  }

  const eventResult = await pool.query(
    `
    INSERT INTO public.events (name, event_date, capacity, created_by)
    VALUES ($1, now(), $2, $3)
    RETURNING id, capacity
    `,
    ["Service concurrency proof", 1, organizerResult.rows[0].id]
  );
  const event = eventResult.rows[0];
  const attendeeIds = profilesResult.rows.map((profile) => profile.id);

  try {
    const results = await Promise.allSettled(
      attendeeIds.map((attendeeId) =>
        registrationService.registerForEvent(event.id, attendeeId)
      )
    );
    const successful = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const countResult = await pool.query(
      "SELECT count(*)::int AS count FROM public.registrations WHERE event_id = $1",
      [event.id]
    );
    const databaseCount = countResult.rows[0].count;

    console.log("Starting service concurrency proof...");
    console.log("Total requests :", attendeeIds.length);
    console.log("Successful     :", successful.length);
    console.log("Rejected       :", rejected.length);
    console.log("Database count :", databaseCount);
    console.log("VERDICT        :", successful.length === 1 && databaseCount === 1 ? "PASS" : "FAIL");
  } finally {
    await pool.query(
      "DELETE FROM public.qr_tokens WHERE registration_id IN (SELECT id FROM public.registrations WHERE event_id = $1)",
      [event.id]
    );
    await pool.query("DELETE FROM public.registrations WHERE event_id = $1", [event.id]);
    await pool.query("DELETE FROM public.events WHERE id = $1", [event.id]);
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("Service concurrency proof failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});
