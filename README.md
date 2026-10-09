# HealthCopilot

A responsive React + TypeScript health companion with an authenticated FastAPI backend and optional MongoDB account storage. AI chat uses Google's Gemini API from the backend when `GEMINI_API_KEY` is configured. The app provides general health information; it does not diagnose or prescribe.

## Start locally

1. Install Node.js 20+ and Python 3.11+.
2. Copy `.env.example` to `.env`. For AI chat, set `GEMINI_API_KEY` to a Google AI API key. Never put this key in frontend files or share it in chat. `GEMINI_MODEL` defaults to `gemini-3.5-flash`. MongoDB and `JWT_SECRET` (a unique random secret of at least 32 characters) are needed only if you use account sign-in and cloud data sync; basic AI chat does not require MongoDB. Keep `.env` private; it is git-ignored.
3. In the project root run `npm.cmd install`, then `npm.cmd run dev`.
4. In a second terminal, install the backend requirements into the project virtual environment and start the API from the project root:

   ```powershell
   py -m venv backend\.venv
   .\.venv\Scripts\python -m pip install -r backend\requirements.txt
   .\.venv\Scripts\python -m backend.main
   ```

The API loads the project-root `.env` itself, even when launched from another working directory. Existing process environment variables take precedence. `API_HOST` and `API_PORT` configure its bind address; set `COOKIE_SECURE=true` when serving over HTTPS and `VITE_API_URL` when the API is not at `http://localhost:8000`. If `GEMINI_API_KEY` is missing, the API still starts and reports a clear configuration error for chat requests.

## Safety and privacy

The signed-in API stores each account's application data in a user-scoped MongoDB document. Passwords are hashed with Argon2; sessions use expiring HttpOnly, SameSite cookies; login requests are rate-limited; CORS is restricted to configured origins. Use TLS, a managed secrets store, backups, monitoring, and an appropriate privacy/compliance review before handling real health information. In-memory rate limiting is a local-development baseline, not a substitute for a distributed production gateway.

The UI starts with clearly labeled synthetic wellness examples. Creating an account or signing in connects the application to the API and syncs that account's data. Submitted Copilot messages are sent through the backend to the configured Gemini model; avoid including identifying information. The Copilot provides general health information, does not diagnose or prescribe, and is not a replacement for a clinician. It must not be used for emergencies. Uploaded documents are not sent to a server or represented as analyzed; users must verify values in their original report and discuss interpretation with a clinician.