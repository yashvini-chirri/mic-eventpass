require("dotenv").config();

const pool = require("../src/config/db");
const registrationService = require("../src/services/registrationService");

async function main() {
  const organizer = (await pool.query(
    "SELECT id FROM public.profiles WHERE role = $1 LIMIT 1",
    ["organizer"]
  )).rows[0];
  const profiles = (await pool.query(
    "SELECT id FROM public.profiles WHERE role = $1 LIMIT 1",
    ["attendee"]
  )).rows[0];
  if (!organizer || !profiles) throw new Error("Organizer and attendee profiles are required");

  const event = (await pool.query(
    `INSERT INTO public.events (name, event_date, capacity, created_by)
     VALUES ($1, now(), 1, $2) RETURNING id`,
    ["Duplicate check-in proof", organizer.id]
  )).rows[0];

  try {
    const registration = await registrationService.registerForEvent(event.id, profiles.id);
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => registrationService.checkInWithQrToken({
        rawToken: registration.qrToken,
        checkedInBy: organizer.id,
      }))
    );
    const successful = results.filter((result) => result.status === "fulfilled").length;
    const rejected = results.filter((result) => result.status === "rejected").length;
    const count = (await pool.query(
      "SELECT count(*)::int AS count FROM public.checkins WHERE registration_id = $1",
      [registration.id]
    )).rows[0].count;
    console.log("Starting duplicate check-in proof...");
    console.log("Total requests : 100");
    console.log("Successful     :", successful);
    console.log("Rejected       :", rejected);
    console.log("Database count :", count);
    console.log("VERDICT        :", successful === 1 && count === 1 ? "PASS" : "FAIL");
  } finally {
    await pool.query(
      "DELETE FROM public.qr_tokens WHERE registration_id IN (SELECT id FROM public.registrations WHERE event_id = $1)",
      [event.id]
    );
    await pool.query("DELETE FROM public.checkins WHERE registration_id IN (SELECT id FROM public.registrations WHERE event_id = $1)", [event.id]);
    await pool.query("DELETE FROM public.registrations WHERE event_id = $1", [event.id]);
    await pool.query("DELETE FROM public.events WHERE id = $1", [event.id]);
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("Duplicate check-in proof failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});
