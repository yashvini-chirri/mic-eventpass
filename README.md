# Eventry

Eventry is a full-stack event management app for MIC events. It supports organizer workflows, attendee registration, QR code ticketing, live dashboards, and AI-assisted event insights.

## Overview

The app has two main parts:

- Frontend: Next.js app in `frontend/`
- Backend: Express + PostgreSQL + Supabase auth in `backend/`

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript
- Backend: Node.js, Express, PostgreSQL, Socket.IO
- Auth: Supabase Auth
- QR handling: `qrcode` and `html5-qrcode`
- UI: custom CSS + Lucide icons

## Current Features

- Organizer login and protected organizer workspace
- Event creation with name, date, and capacity
- Attendee registration for a selected event
- One-time QR pass generation per registration
- QR check-in using:
  - live camera scanner
  - uploaded image scan
  - manual token entry
- Organizer dashboard with live event stats and attendee list
- Real-time refresh using Socket.IO
- CSV export of event attendance data
- Offline QR scan queue with retry on reconnect
- AI event insights powered by Gemini when configured, with optional OpenAI support
- Fallback insight generation from raw database statistics if AI is unavailable
- Server-side security checks for Supabase access tokens and user role enforcement
- Database concurrency protections for capacity limits and duplicate check-ins

## Project Structure

```text
mic-eventpass/
├── backend/
│   ├── src/
│   ├── sql/
│   ├── tests/
│   ├── .env
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   ├── .env.local.example
│   ├── package.json
│   └── README.md
├── README.md
└── .gitignore
```
##Screenshots
1)splashscreen
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/792da209-1a03-43fe-916d-05eb65824422" />
2)login page
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/cdf15940-1701-47e0-a97b-87708258450f" />
3)organizer page
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/70b1108d-c008-4236-96e0-48fb40c6f771" />
4)attendee page
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/775de0e5-85c3-409d-a39a-33f9fb05f5d3" />
4)darkmode
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/501f7bf3-b059-47ca-a6c0-17c8fc0bdbbf" />






## Local Setup

### 1) Install dependencies

Backend:

```powershell
cd backend
npm install
```

Frontend:

```powershell
cd frontend
npm install
```

### 2) Configure environment variables

Create `backend/.env` using the example file as a guide:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.6-flash
# Optional alternative provider when Gemini is not configured
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
PORT=5000
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 3) Start the app

Backend:

```powershell
cd backend
npm run dev
```

Frontend:

```powershell
cd frontend
npm run dev
```

Open:

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Supabase Setup

Apply the SQL profile policy script in your Supabase SQL editor:

```sql
-- backend/sql/001_profiles_rls.sql
```

This helps enforce per-user profile access and role checks for the signed-in frontend.

## Authentication Flow

- Users sign in with Supabase Auth from the frontend.
- The frontend sends the access token in the Authorization header.
- The backend verifies the token with Supabase.
- The backend loads the user's profile and checks the assigned role.
- Organizers and attendees get different access to routes and features.

## API Notes

Main backend routes include:

- `GET /api/events`
- `POST /api/events`
- `POST /api/registrations`
- `POST /api/registrations/check-in`
- `GET /api/registrations/dashboard/:eventId`
- `GET /api/registrations/export/:eventId`
- `POST /api/insights/:eventId`

## Verification / Proof Scripts

### Capacity protection

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

### Protected registration flow

```powershell
cd backend
node tests/concurrency-registration.js
```

This script uses real Supabase access tokens from `TEST_ACCESS_TOKENS` and checks protected registration behavior under concurrency.

### Duplicate check-in protection

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

## AI Insights

Gemini is preferred and called from the backend only. The backend passes the live event statistics calculated from PostgreSQL as context and instructs the model to use only those values. OpenAI is supported as an optional alternative when Gemini is not configured. If the selected API key is missing, unavailable, or times out, the app falls back to a deterministic database-statistics answer instead of breaking the feature.

Example:

```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.6-flash
# Optional alternative provider
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

## Notes

- The app is designed for event check-in and attendee tracking workflows.
- The frontend and backend must both be running during normal use.
- The repository is set up for local development and can be extended for deployment later.

## Status

This project is currently implemented with the core end-to-end flow for:

- event creation
- attendee binding
- QR registration
- organizer check-in
- live dashboard updates
- offline queue recovery
- analytics insights
- secure role-based backend access
