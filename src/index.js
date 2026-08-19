import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   PRODUCTION SYSTEM
   =========================================================
   ROLES
   - ADMIN
   - HUNTER
   - DEALERSHIP

   WORKFLOW
   HUNTER -> SUBMIT LEAD
   ADMIN  -> REVIEW / APPROVE / DECLINE / ASSIGN / COMMISSION
   DEALER -> WORK LEAD / UPDATE STATUS
   ADMIN  -> MARK COMMISSION PAYABLE / PAID

   BRANDING
   - Sibakane Purple
   - Gold / Yellow
   - White
   - Dark Charcoal
   - Mobile-first
========================================================= */


/* =========================================================
   BRAND CONFIGURATION
========================================================= */

const BRAND = {
  name: "Sibakane T & O Auto",

  /* Main brand colours */
  purple: "#5B2A86",
  purpleDark: "#3D1B5F",
  purpleLight: "#7B43A8",

  gold: "#F2C94C",
  goldDark: "#D4A900",
  goldLight: "#FFE58A",

  white: "#FFFFFF",
  charcoal: "#242424",
  charcoalLight: "#3A3A3A",

  background: "#F5F3F8",
  border: "#E5DFEC",

  /* Change this to the exact logo image path later if desired */
  logo: ""
};


/* =========================================================
   HELPERS
========================================================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function getSessionId(c) {
  const cookie = c.req.header("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}


function redirect(c, location) {
  return c.redirect(location, 302);
}


async function getCurrentUser(c) {
  const sessionId = getSessionId(c);

  if (!sessionId) {
    return null;
  }

  const session = await c.env.DB
    .prepare(`
      SELECT
        sessions.id,
        sessions.user_id,
        sessions.expires_at,
        users.name,
        users.email,
        users.role,
        users.active
      FROM sessions
      JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.id = ?
        AND users.active = 1
      LIMIT 1
    `)
    .bind(sessionId)
    .first();

  if (!session) {
    return null;
  }

  if (
    session.expires_at &&
    new Date(session.expires_at) <= new Date()
  ) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();

    return null;
  }

  return session;
}


async function requireRole(c, role) {
  const user = await getCurrentUser(c);

  if (!user) {
    return null;
  }

  if (user.role !== role) {
    return false;
  }

  return user;
}


async function logActivity(
  c,
  userId,
  action,
  details = "",
  leadId = null
) {
  await c.env.DB
    .prepare(`
      INSERT INTO activity_log
      (user_id, lead_id, action, details)
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      userId || null,
      leadId || null,
      action,
      details
    )
    .run();
}


function now() {
  return new Date().toISOString();
}


function generateLeadReference() {
  return `LEAD-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}


function statusLabel(status) {
  const labels = {
    new: "New",
    pending: "Pending Review",
    approved: "Approved",
    declined: "Declined",
    assigned: "Assigned",
    contacted: "Customer Contacted",
    interested: "Customer Interested",
    appointment: "Appointment Set",
    test_drive: "Test Drive",
    negotiating: "Negotiating",
    sold: "Sold",
    lost: "Lost",
    cancelled: "Cancelled"
  };

  return labels[status] || status;
}


function commissionLabel(status) {
  const labels = {
    pending: "Pending",
    payable: "Payable",
    paid: "Paid"
  };

  return labels[status] || status;
}


/* =========================================================
   BRAND HEADER
========================================================= */

function brandLogo(size = "normal") {

  const logoImage = BRAND.logo
    ? `
      <img
        src="${escapeHtml(BRAND.logo)}"
        alt="${escapeHtml(BRAND.name)} logo"
        class="brand-logo-image ${size}"
      >
    `
    : `
      <div class="brand-mark ${size}">
        <span class="brand-mark-s">S</span>
        <span class="brand-mark-t">T&O</span>
      </div>
    `;

  return `
    <div class="brand-lockup">
      ${logoImage}

      <div class="brand-copy">
        <div class="brand-name">
          ${escapeHtml(BRAND.name)}
        </div>

        <div class="brand-tagline">
          AUTOMOTIVE LEAD MANAGEMENT
        </div>
      </div>
    </div>
  `;
}


/* =========================================================
   GLOBAL STYLES
========================================================= */

function baseStyles() {
  return `
<style>

:root{
  --purple:#5B2A86;
  --purple-dark:#3D1B5F;
  --purple-light:#7B43A8;

  --gold:#F2C94C;
  --gold-dark:#D4A900;
  --gold-light:#FFE58A;

  --white:#FFFFFF;
  --charcoal:#242424;
  --charcoal-light:#3A3A3A;

  --background:#F5F3F8;
  --border:#E5DFEC;

  --success:#198754;
  --danger:#C62828;
  --orange:#D97706;
  --blue:#1565C0;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  font-family:
    Arial,
    Helvetica,
    sans-serif;
  background:var(--background);
  color:var(--charcoal);
}

a{
  color:inherit;
}

button,
input,
select,
textarea{
  font-family:inherit;
}


/* =========================================================
   BRAND
========================================================= */

.brand-lockup{
  display:flex;
  align-items:center;
  gap:12px;
}

.brand-mark{
  width:48px;
  height:48px;
  border-radius:12px;
  background:var(--purple);
  border:3px solid var(--gold);
  display:flex;
  align-items:center;
  justify-content:center;
  flex-direction:column;
  line-height:1;
  box-shadow:0 4px 12px rgba(0,0,0,.2);
  flex-shrink:0;
}

.brand-mark.normal{
  width:48px;
  height:48px;
}

.brand-mark.large{
  width:82px;
  height:82px;
  border-radius:20px;
}

.brand-mark-s{
  color:var(--gold);
  font-size:21px;
  font-weight:900;
}

.brand-mark.large .brand-mark-s{
  font-size:34px;
}

.brand-mark-t{
  color:var(--white);
  font-size:8px;
  font-weight:900;
  margin-top:3px;
}

.brand-mark.large .brand-mark-t{
  font-size:12px;
}

.brand-logo-image{
  width:48px;
  height:48px;
  object-fit:contain;
}

.brand-logo-image.large{
  width:82px;
  height:82px;
}

.brand-copy{
  min-width:0;
}

.brand-name{
  font-weight:900;
  font-size:18px;
  color:var(--white);
  line-height:1.1;
}

.brand-tagline{
  color:var(--gold);
  font-size:9px;
  font-weight:800;
  letter-spacing:1px;
  margin-top:4px;
}


/* =========================================================
   HEADER
========================================================= */

header{
  background:
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );

  color:var(--white);

  padding:13px 20px;

  display:flex;
  justify-content:space-between;
  align-items:center;

  gap:18px;

  border-bottom:4px solid var(--gold);

  box-shadow:
    0 3px 15px rgba(61,27,95,.25);
}

header h1{
  margin:0;
  font-size:19px;
}


/* =========================================================
   NAV
========================================================= */

nav{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

nav a,
.btn{
  display:inline-block;

  padding:9px 13px;

  border-radius:7px;

  text-decoration:none;

  border:0;

  font-weight:800;

  cursor:pointer;

  font-size:13px;

  transition:
    transform .15s ease,
    opacity .15s ease,
    background .15s ease;
}

nav a:hover,
.btn:hover{
  transform:translateY(-1px);
  opacity:.94;
}

nav a{
  color:var(--white);
  background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.15);
}

nav a:hover{
  background:var(--gold);
  color:var(--purple-dark);
}

.btn{
  background:var(--purple);
  color:var(--white);
}

.btn.green{
  background:var(--success);
}

.btn.red{
  background:var(--danger);
}

.btn.orange{
  background:var(--orange);
}

.btn.blue{
  background:var(--blue);
}

.btn.gray{
  background:#666;
}

.btn.gold{
  background:var(--gold);
  color:var(--purple-dark);
}


/* =========================================================
   MAIN
========================================================= */

main{
  max-width:1250px;
  margin:auto;
  padding:22px 16px;
}


/* =========================================================
   CARDS
========================================================= */

.card{
  background:var(--white);

  padding:20px;

  border-radius:12px;

  box-shadow:
    0 3px 15px rgba(61,27,95,.08);

  margin-bottom:18px;

  border:1px solid var(--border);
}

.card h2{
  color:var(--purple-dark);
  margin-top:0;
}

.card h3{
  color:var(--purple);
}


/* =========================================================
   BRAND CARD
========================================================= */

.brand-banner{
  background:
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );

  color:var(--white);

  border-radius:14px;

  padding:20px;

  margin-bottom:18px;

  border-bottom:5px solid var(--gold);

  box-shadow:
    0 5px 20px rgba(61,27,95,.18);
}

.brand-banner .brand-name{
  font-size:24px;
}

.brand-banner .brand-tagline{
  font-size:11px;
}


/* =========================================================
   STATS
========================================================= */

.grid{
  display:grid;

  grid-template-columns:
    repeat(auto-fit,minmax(170px,1fr));

  gap:14px;

  margin-bottom:18px;
}

.stat{
  background:var(--white);

  padding:18px;

  border-radius:12px;

  box-shadow:
    0 3px 15px rgba(61,27,95,.06);

  border-top:4px solid var(--gold);
}

.stat h3{
  margin:0;
  font-size:14px;
  color:#777;
}

.stat strong{
  display:block;
  font-size:30px;
  margin-top:8px;
  color:var(--purple-dark);
}


/* =========================================================
   TABLE
========================================================= */

table{
  width:100%;

  border-collapse:collapse;

  min-width:850px;
}

th,
td{
  padding:11px;

  border-bottom:1px solid #eee;

  text-align:left;

  vertical-align:top;
}

th{
  background:
    #F7F3FA;

  color:var(--purple-dark);

  font-weight:900;
}

.table-wrap{
  overflow-x:auto;
}


/* =========================================================
   BADGES
========================================================= */

.badge{
  display:inline-block;

  padding:5px 8px;

  border-radius:6px;

  background:#eee;

  font-size:12px;

  font-weight:bold;
}

.success{
  background:#DFF5E7;
  color:#146C2E;
}

.warning{
  background:#FFF0D2;
  color:#8A5700;
}

.danger{
  background:#FFE0E0;
  color:#A00000;
}

.info{
  background:#E1EFFF;
  color:#145A9C;
}

.purple-badge{
  background:#EEE2F7;
  color:var(--purple-dark);
}

.gold-badge{
  background:#FFF4C7;
  color:#765D00;
}


/* =========================================================
   FORMS
========================================================= */

.form-grid{
  display:grid;

  grid-template-columns:
    repeat(auto-fit,minmax(220px,1fr));

  gap:14px;
}

label{
  display:block;

  font-weight:bold;

  font-size:13px;

  margin-bottom:6px;
}

input,
select,
textarea{
  width:100%;

  padding:11px;

  border:1px solid #ccc;

  border-radius:7px;

  font:inherit;

  background:#fff;
}

input:focus,
select:focus,
textarea:focus{
  outline:none;

  border-color:var(--purple);

  box-shadow:
    0 0 0 3px rgba(91,42,134,.12);
}

textarea{
  min-height:100px;

  resize:vertical;
}


/* =========================================================
   ACTIONS
========================================================= */

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}


/* =========================================================
   NOTICES
========================================================= */

.empty{
  text-align:center;

  padding:25px;

  color:#777;
}

.notice{
  padding:13px;

  border-radius:8px;

  background:#F0E9F6;

  border-left:4px solid var(--purple);

  margin-bottom:15px;
}

.notice.gold{
  background:#FFF8D9;

  border-left-color:var(--gold-dark);
}

.amount{
  font-weight:bold;
  font-size:18px;
  color:var(--purple-dark);
}


/* =========================================================
   LOGIN PAGE
========================================================= */

.login-page{
  min-height:100vh;

  background:
    radial-gradient(
      circle at top right,
      rgba(242,201,76,.18),
      transparent 30%
    ),
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );

  display:flex;

  align-items:center;

  justify-content:center;

  padding:20px;
}

.login-box{
  width:100%;
  max-width:430px;

  background:var(--white);

  padding:30px;

  border-radius:18px;

  box-shadow:
    0 20px 60px rgba(0,0,0,.3);

  border-top:7px solid var(--gold);
}

.login-brand{
  text-align:center;

  display:flex;

  flex-direction:column;

  align-items:center;

  margin-bottom:24px;
}

.login-brand .brand-name{
  color:var(--purple-dark);

  font-size:25px;

  margin-top:12px;
}

.login-brand .brand-tagline{
  color:var(--purple);

  font-size:10px;

  margin-top:6px;
}

.login-subtitle{
  text-align:center;

  color:#777;

  margin:8px 0 25px;
}

.login-button{
  width:100%;

  margin-top:22px;

  padding:14px;

  border:0;

  border-radius:8px;

  background:
    linear-gradient(
      135deg,
      var(--purple),
      var(--purple-dark)
    );

  color:white;

  font-size:16px;

  font-weight:bold;

  border-bottom:4px solid var(--gold);

  cursor:pointer;
}

.error{
  background:#FFE5E5;

  color:#A00000;

  padding:12px;

  border-radius:8px;

  margin-bottom:15px;

  text-align:center;
}

.login-footer{
  margin-top:22px;

  text-align:center;

  font-size:11px;

  color:#888;
}

.login-footer strong{
  color:var(--purple);
}


/* =========================================================
   RESPONSIVE
========================================================= */

@media(max-width:700px){

  header{
    align-items:flex-start;

    flex-direction:column;

    padding:14px;
  }

  header nav{
    width:100%;
  }

  header nav a{
    flex:1;
    text-align:center;
    min-width:90px;
  }

  main{
    padding:15px 10px;
  }

  .brand-name{
    font-size:16px;
  }

  .brand-tagline{
    font-size:8px;
  }

  .card{
    padding:15px;
  }

  .grid{
    grid-template-columns:
      repeat(2,minmax(0,1fr));
  }

  .stat{
    padding:14px;
  }

  .stat strong{
    font-size:24px;
  }

}

@media(max-width:430px){

  .grid{
    grid-template-columns:1fr;
  }

  .login-box{
    padding:23px;
  }

}

</style>
`;
}


/* =========================================================
   LOGIN PAGE
========================================================= */

function loginPage(error = "") {

  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>${escapeHtml(BRAND.name)}</title>

${baseStyles()}

</head>

<body>

<div class="login-page">

<div class="login-box">

<div class="login-brand">

${brandLogo("large")}

</div>

<div class="login-subtitle">

Secure Lead Management System

</div>

${error ? `
<div class="error">
${escapeHtml(error)}
</div>
` : ""}

<form
method="POST"
action="/login"
>

<label>
Email
</label>

<input
type="email"
name="email"
required
autocomplete="username"
>

<label style="margin-top:15px;">
Password
</label>

<input
type="password"
name="password"
required
autocomplete="current-password"
>

<button
class="login-button"
type="submit"
>
Login
</button>

</form>

<div class="login-footer">

<strong>${escapeHtml(BRAND.name)}</strong>

<br>

Automotive Lead Management

</div>

</div>

</div>

</body>

</html>
`;
}


/* =========================================================
   ADMIN DASHBOARD DATA
========================================================= */

async function getDashboardData(c) {

  const results = await Promise.all([

    c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM hunters WHERE active = 1"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM dealerships WHERE active = 1"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM leads"
    ).first(),

    c.env.DB.prepare(`
      SELECT status, COUNT(*) AS total
      FROM leads
      GROUP BY status
      ORDER BY status
    `).all(),

    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(commission_amount),0) AS commission_total,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'payable'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS payable_total,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'paid'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS paid_total

      FROM leads
    `).first(),

    c.env.DB.prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name

      FROM leads

      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id

      ORDER BY leads.id DESC

      LIMIT 10
    `).all(),

    c.env.DB.prepare(`
      SELECT
        activity_log.*,
        users.name AS user_name

      FROM activity_log

      LEFT JOIN users
        ON users.id = activity_log.user_id

      ORDER BY activity_log.id DESC

      LIMIT 10
    `).all()

  ]);

  return {

    users:results[0]?.total || 0,

    hunters:results[1]?.total || 0,

    dealerships:results[2]?.total || 0,

    leads:results[3]?.total || 0,

    statuses:results[4]?.results || [],

    commissions:results[5] || {},

    recentLeads:results[6]?.results || [],

    activity:results[7]?.results || []

  };
}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function adminDashboard(user,data) {

  const statusCards = data.statuses.length

    ? data.statuses.map((item) => `

<div class="stat">

<h3>
${escapeHtml(statusLabel(item.status))}
</h3>

<strong>
${item.total}
</strong>

</div>

`).join("")

    : `
<div class="card empty">
No leads yet.
</div>
`;

  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>Admin Dashboard - ${escapeHtml(BRAND.name)}</title>

${baseStyles()}

</head>

<body>

<header>

${brandLogo()}

<nav>

<a href="/admin">
Dashboard
</a>

<a href="/admin/leads">
Leads
</a>

<a href="/admin/hunters">
Hunters
</a>

<a href="/admin/dealerships">
Dealerships
</a>

<a href="/admin/users">
Users
</a>

<a href="/logout">
Logout
</a>

</nav>

</header>

<main>

<div class="brand-banner">

${brandLogo()}

<p style="margin:12px 0 0;color:#fff;opacity:.9;">

Admin Control Centre

</p>

</div>


<div class="card">

<h2>
Admin Control Centre
</h2>

<p>
Welcome
<strong>
${escapeHtml(user.name)}
</strong>
</p>

<p>
${escapeHtml(user.email)}
</p>

<p>

<span class="badge gold-badge">
● SYSTEM ONLINE
</span>

</p>

</div>


<div class="grid">

<div class="stat">

<h3>
Total Users
</h3>

<strong>
${data.users}
</strong>

</div>


<div class="stat">

<h3>
Active Hunters
</h3>

<strong>
${data.hunters}
</strong>

</div>


<div class
