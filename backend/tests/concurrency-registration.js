require("dotenv").config();

const pool = require("../src/config/db");
const accessTokens = process.env.TEST_ACCESS_TOKENS
  ? JSON.parse(process.env.TEST_ACCESS_TOKENS)
  : {};

const EVENT_ID = "42bf2bb8-5240-414c-9835-1b226721e3ca";

const URL = "http://[::1]:5000/api/registrations";

async function register(attendeeId) {
  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessTokens[attendeeId] || ""}`
      },
      body: JSON.stringify({
        eventId: EVENT_ID,
        attendeeId: attendeeId
      })
    });

    const data = await response.json();

    return {
      success: response.ok,
      status: response.status,
      attendeeId,
      data
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      attendeeId,
      error: error.message
    };
  }
}

async function main() {
  const eventResult = await pool.query(
    "SELECT capacity FROM public.events WHERE id = $1",
    [EVENT_ID]
  );
  const event = eventResult.rows[0];

  if (!event) {
    throw new Error(`Test event not found: ${EVENT_ID}`);
  }

  const existingResult = await pool.query(
    "SELECT count(*)::int AS count FROM public.registrations WHERE event_id = $1",
    [EVENT_ID]
  );
  const existingCount = existingResult.rows[0].count;

  const profilesResult = await pool.query(
    `
    SELECT id
    FROM public.profiles
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.registrations
      WHERE registrations.event_id = $1
        AND registrations.attendee_id = profiles.id
    )
    LIMIT $2
    `,
    [EVENT_ID, event.capacity - existingCount + 1]
  );
  const attendeeIds = profilesResult.rows.map((profile) => profile.id);
  const capacity = Number(event.capacity);
  const expectedSuccesses = capacity - existingCount;

  if (attendeeIds.some((attendeeId) => !accessTokens[attendeeId])) {
    throw new Error(
      "Set TEST_ACCESS_TOKENS to a JSON object mapping each attendee profile ID to its Supabase access token"
    );
  }

  if (attendeeIds.length !== expectedSuccesses + 1) {
    throw new Error(
      `Expected ${expectedSuccesses + 1} unused profiles, found ${attendeeIds.length}`
    );
  }

  console.log("Starting concurrency test...");
  console.log("Event:", EVENT_ID);
  console.log("Capacity:", event.capacity);
  console.log("Existing registrations:", existingCount);
  console.log("Requests:", attendeeIds.length);

  const results = await Promise.all(
    attendeeIds.map((id) => register(id))
  );

  const successful = results.filter((r) => r.success);
  const rejected = results.filter((r) => !r.success);

  console.log("");
  console.log("========== RESULTS ==========");
  console.log("Total requests :", results.length);
  console.log("Successful     :", successful.length);
  console.log("Rejected       :", rejected.length);

  const finalCountResult = await pool.query(
    "SELECT count(*)::int AS count FROM public.registrations WHERE event_id = $1",
    [EVENT_ID]
  );
  const finalCount = finalCountResult.rows[0].count;
  console.log("Database count :", finalCount);

  console.log("");
  console.log("Successful:");

  successful.forEach((r) => {
    console.log(r.attendeeId, r.data);
  });

  console.log("");
  console.log("Rejected:");

  rejected.forEach((r) => {
    console.log(
      r.attendeeId,
      "HTTP",
      r.status,
      r.data || r.error
    );
  });

  console.log("");
  console.log("========== VERDICT ==========");

  if (successful.length === expectedSuccesses && finalCount === capacity) {
    console.log("PASS: Capacity was respected under concurrency.");
  } else {
    console.log(
      `FAIL: Expected ${expectedSuccesses} successes and database count ${capacity}`
    );
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("Concurrency test failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});