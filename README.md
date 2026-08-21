# MIC EventPass

Event registration and QR check-in system for MIC events.

## Run Locally

Backend:

```powershell
cd backend
npm start
```

Frontend:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000`.

Configure `backend/.env` with `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Configure `frontend/.env.local` with the public Supabase URL/key and `NEXT_PUBLIC_API_URL`.

Apply `backend/sql/001_profiles_rls.sql` in Supabase SQL Editor when setting up a fresh database. It allows the signed-in frontend to read only the current user's role profile.

## Implemented Requirements

- Organizer event creation with name, date, and capacity.
- Attendee registration with one unique QR token per registration.
- One-time QR tokens: random raw tokens are shown once, SHA-256 hashes are stored, and tokens expire after 24 hours.
- Camera scanning, QR image upload, and manual token check-in.
- Database-safe capacity using a PostgreSQL transaction and `SELECT ... FOR UPDATE` on the event row.
- Database-safe duplicate check-in handling using a locked QR token row and the unique `checkins.registration_id` constraint.
- Supabase Auth bearer-token verification and backend role enforcement.
- Organizer dashboard polling every five seconds.
- Organizer CSV export with attendee and check-in data.
- Offline scan queue in browser storage. The queue retries after reconnect; if another station checked in first, the server returns a duplicate response and the queued item is resolved without creating another check-in.
- Server-side AI insights using database-computed statistics, an eight-second timeout, and deterministic raw-stat fallback when OpenAI is unavailable.

Socket.IO powers live dashboard notifications. Event creation, registration, and check-in emit an `event:updated` notification; the organizer dashboard reloads the selected event immediately without a manual refresh.

## Concurrency Proof

Run the database-level service proof:

```powershell
cd backend
node tests/concurrency-service.js
```

Expected result for a capacity-1 event:

```text
Total requests : 100
Successful     : 1
Rejected       : 99
Database count : 1
VERDICT        : PASS
```

The protected HTTP concurrency script is `backend/tests/concurrency-registration.js`. It requires real Supabase access tokens through `TEST_ACCESS_TOKENS`, because protected routes must not accept spoofed profile IDs.

Run the duplicate check-in race proof:

```powershell
cd backend
node tests/concurrency-checkin-service.js
```

Expected result:

```text
Total requests : 100
Successful     : 1
Rejected       : 99
Database count : 1
VERDICT        : PASS
```

## AI Configuration

The OpenAI key is server-side only:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

If the key is missing or the API times out, the backend returns answers generated from the current database statistics.
