# SeatSathi

**Live site:** https://nik035.github.io/seatsathi/

A platform for self-study libraries — the reading halls that rent desks to students preparing for exams.

- **Students** find libraries near them, see which desks are free on a live seat map, book the exact seat, pay the owner directly by UPI or bank transfer, get fee-due reminders and a digital membership card, and can subscribe to a last-24-hours current affairs feed (my area / city / country / world / exam topics).
- **Owners** list their library (location pin, facilities, plans and fees, seat layout, UPI and bank details), import their existing students, see the whole hall at a glance (paid / due soon / due / overdue / free), confirm payments, send one-tap WhatsApp or SMS reminders, free seats of non-payers (manually or automatically), post notices, manage a waitlist and download monthly reports.
- **Admin** (you) sees sign-ups, libraries, seats, occupancy, online bookings, fees processed, daily visitors and a per-city breakdown, and can suspend a library.

It runs entirely on free tiers: **GitHub Pages** for hosting, **Firebase** (Firestore + Authentication) for data and Google sign-in, and a scheduled **GitHub Action** that pulls Google News every 3 hours.

---

## Demo mode vs live mode

Until you add Firebase keys, the site runs in **demo mode**: everything works, with sample libraries and one-click demo accounts (student, owner, admin), but data is stored only in each visitor's own browser. Once you finish the steps below, it becomes a real shared database with real logins.

## Connect Firebase

About 10 minutes, all free (Spark plan — no card needed).

1. **Create a project** — go to https://console.firebase.google.com → *Add project* → name it `seatsathi` → you can switch Google Analytics off → *Create*.
2. **Add a web app** — on the project home, click the `</>` (Web) icon → nickname `seatsathi-web` → *Register app*. Firebase shows a `firebaseConfig = { ... }` block. Keep that tab open.
3. **Turn on sign-in** — left menu *Build → Authentication → Get started*:
   - *Sign-in method* tab → enable **Google** (pick your support email) and **Email/Password**.
   - *Settings* tab → *Authorized domains* → *Add domain* → `nik035.github.io`.
4. **Create the database** — *Build → Firestore Database → Create database* → choose location **asia-south1 (Mumbai)** → start in **production mode**.
5. **Add the security rules** — in Firestore, open the *Rules* tab, replace everything with the contents of [`firestore.rules`](firestore.rules), change `YOUR_ADMIN_EMAIL@gmail.com` to your Google email, and click *Publish*.
6. **Paste the keys into the site** — edit [`js/config.js`](js/config.js) on GitHub (pencil icon):
   - copy the values from step 2 into `FIREBASE_CONFIG`,
   - put your email in `ADMIN_EMAILS`, e.g. `ADMIN_EMAILS = ["you@gmail.com"]`,
   - *Commit changes*. The site redeploys in about a minute.

   The Firebase web config is meant to be public — access is controlled by the security rules, not by hiding the key.
7. **Sign in** at the live site with that Google account → you'll land on the **Admin** dashboard.

> If Firebase asks you to create an index when a page loads, click the link in the browser console — it creates it in one click. (The app is written to avoid needing any.)

## How the pieces fit

| Piece | Where | Notes |
|---|---|---|
| Website | `index.html`, `css/`, `js/` | Plain HTML/CSS/JS modules, no build step |
| Data & login | Firebase Firestore + Auth | `js/store.js` talks to Firebase, or to the browser in demo mode |
| Security | `firestore.rules` | Students can only see their own bookings; owners only their library's members and payments; seat occupancy is public with no personal data |
| Current affairs | `scripts/fetch_news.py` | Google News RSS, last 24 h, for 30 cities, 14 countries, India, World and 7 exam topics. Edit the lists in `js/config.js` |
| Deploy | `.github/workflows/deploy.yml` | Publishes to GitHub Pages on every push and every 3 hours (to refresh news) |
| Maps | OpenStreetMap + Leaflet | Free, no API key |

"My area" news and custom searches query Google News live through a public relay; if that relay is busy, the page falls back to the student's city feed.

### Data model (Firestore)

- `users/{uid}` — role (`student` / `owner`), name, phone, city, area, location, exam, news subscription
- `libraries/{id}` — owner, address, pin, hours, plans, facilities, seats and layout, UPI and bank, fee rules, notices
- `libraries/{id}/seats/{seatNo}` — `held` (booked, awaiting payment) or `taken`
- `libraries/{id}/waitlist/{uid}`
- `memberships/{id}` — student ↔ seat, plan, fee, joined on, next due date, status
- `payments/{id}` — amount, method, UTR, `claimed` → `confirmed` / `rejected`
- `reviews/{id}`, `visits/{id}` (one anonymous record per browser per day)

### How fees work

- When a booking's payment is confirmed, the next due date is set from the library's rule: **on the joining date each month**, or **a fixed day for everyone** (e.g. the 5th).
- Status: *Paid* → *Due soon* (3 days before) → *Due* (within the grace period) → *Overdue*.
- If the owner sets "free overdue seats automatically after N days", those seats are released the next time the owner opens the dashboard.

## Honest limits and what to add next

- **Reminders open WhatsApp/SMS with the message ready; the owner taps send.** Fully automatic SMS/WhatsApp needs a paid provider (MSG91, Gupshup, Twilio — roughly ₹0.15–0.25 per SMS) plus a small server such as a Firebase Cloud Function (needs the Blaze pay-as-you-go plan).
- **Payments go straight to the owner, so the owner confirms them by checking their UPI app.** Automatic confirmation would need a gateway like Razorpay or Cashfree with split settlements to each owner.
- **Phone-number OTP login** needs Firebase's Blaze plan; Google and email login are free.
- **Shift sharing** (one desk used by a morning and an evening student) is handled as separate plans today; a per-shift seat map is a natural next step.
- Other ideas: attendance via QR scan at the door, locker add-ons, referral discounts, owner payouts/GST invoices, Hindi language toggle, push notifications (installable app).
