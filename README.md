# bloodbank-api

REST API sitting between the desktop app and your MySQL database, so the
database credentials never ship inside the `.exe`. The desktop app talks to
this API over HTTPS with a per-user login (JWT), instead of connecting to
MySQL directly.

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | none | Returns a JWT + user profile |
| POST | `/auth/register-donor` | none | Public donor self-registration |
| GET | `/auth/me` | any | Current user's profile |
| GET | `/blood-stock` | any | Current stock levels |
| PATCH | `/blood-stock/:bloodType` | STAFF/ADMIN | Set stock quantity |
| GET | `/blood-requests` | any | Hospitals see their own; staff/admin see all |
| POST | `/blood-requests` | HOSPITAL | Submit a request |
| POST | `/blood-requests/:id/approve` | STAFF/ADMIN | Approve + deduct stock (transactional) |
| POST | `/blood-requests/:id/reject` | STAFF/ADMIN | Reject |
| GET | `/appointments` | any | Donors see their own; staff/admin see all |
| POST | `/appointments` | DONOR | Book a slot |
| POST | `/appointments/:id/cancel` | DONOR | Cancel own appointment |

This covers the sensitive/shared-state operations (login, stock, requests,
appointments). Add `staff.js` / `hospitals.js` routes the same way if you
need admin-side CRUD for managing those accounts remotely too.

## Local setup

```bash
npm install
cp .env.example .env   # fill in your real DB host/user/password + a random JWT_SECRET
npm run dev
```

## Deploying on Render

1. Push this folder to its own GitHub repo (or a subfolder of an existing one).
2. Render dashboard → **New** → **Web Service** → connect the repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free is fine to start
4. Add environment variables under **Environment** (same keys as `.env.example`):
   `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`,
   `JWT_SECRET`, `JWT_EXPIRES_IN`. Generate `JWT_SECRET` with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
5. Deploy. Render gives you a URL like `https://bloodbank-api.onrender.com`.

**Lock down the MySQL user this API connects as** — grant it only
`SELECT, INSERT, UPDATE` on the specific tables it needs (`users`, `donors`,
`staff`, `hospitals`, `blood_stock`, `blood_requests`, `appointments`), not
full database privileges. This API is now the *only* thing holding real DB
credentials, so it's worth that ten minutes of `GRANT` statements.

## Java client status

The desktop app has been rewritten to use this API — see the
`bloodbank-client-api-integration` build. Every panel (`Login`,
`DonorRegistration`, `DonorDashboard`, `StaffDashboard`,
`HospitalDashboard`, `AdminDashboard`) calls a `service/` class that talks
to these endpoints over HTTPS instead of running SQL directly. `.env` (or a
hardcoded fallback in `AppConfig.java`) in the desktop app only needs one
value: the API's base URL. No DB host, user, or password ships with the app
at all.

Free-tier Render note: the service spins down after inactivity and takes a
few seconds to wake on the next request — fine for a small/demo deployment,
worth upgrading to a paid instance if you need it always-warm.
