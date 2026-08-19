import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   BRANDED PRODUCTION SYSTEM
   Purple • Gold/Yellow • White • Dark Charcoal
========================================================= */

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

function now() {
  return new Date().toISOString();
}

function generateLeadReference() {
  return `LEAD-${Date.now()}-${crypto.randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;
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
   SESSION
========================================================= */

async function getCurrentUser(c) {
  const sessionId = getSessionId(c);

  if (!sessionId) return null;

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

  if (!session) return null;

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

  if (!user) return null;
  if (user.role !== role) return false;

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

/* =========================================================
   BRANDING
========================================================= */

function brandLogo() {
  return `
    <div class="brand-lockup">
      <div class="brand-mark">
        <span>S</span>
      </div>

      <div class="brand-text">
        <div class="brand-name">
          SIBAKANE <span>T & O</span> AUTO
        </div>

        <div class="brand-tagline">
          Your Journey. Our Commitment.
        </div>
      </div>
    </div>
  `;
}

function brandedHeader(title, links = []) {
  return `
<header class="site-header">

  <div class="header-inner">

    <a href="/" class="header-brand">
      ${brandLogo()}
    </a>

    <div class="header-right">

      <div class="page-title">
        ${escapeHtml(title)}
      </div>

      <nav class="main-nav">
        ${links.map(link => `
          <a href="${link.href}" class="${link.active ? "active" : ""}">
            ${escapeHtml(link.label)}
          </a>
        `).join("")}
      </nav>

    </div>

  </div>

</header>
`;
}

/* =========================================================
   GLOBAL BRANDED CSS
========================================================= */

function baseStyles() {
  return `
<style>

:root{
  --purple:#5b168b;
  --purple-dark:#3b0b5c;
  --purple-light:#7b2cbf;
  --gold:#f4c430;
  --gold-dark:#d4a900;
  --white:#ffffff;
  --charcoal:#211d24;
  --background:#f6f3f8;
  --muted:#77717b;
  --border:#e7e1eb;
  --green:#198754;
  --red:#c62828;
  --blue:#1565c0;
  --orange:#d97706;
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
    Inter,
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
  background:var(--gold);
  color:var(--purple-dark);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:27px;
  font-weight:900;
  box-shadow:0 4px 12px rgba(0,0,0,.18);
  border:3px solid rgba(255,255,255,.9);
}

.brand-mark span{
  transform:skew(-8deg);
}

.brand-name{
  font-weight:900;
  font-size:19px;
  letter-spacing:.4px;
  color:#fff;
}

.brand-name span{
  color:var(--gold);
}

.brand-tagline{
  color:#eee;
  font-size:10px;
  margin-top:3px;
  letter-spacing:.7px;
  text-transform:uppercase;
}

/* =========================================================
   HEADER
========================================================= */

.site-header{
  background:
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );
  color:#fff;
  border-bottom:4px solid var(--gold);
  box-shadow:0 5px 20px rgba(59,11,92,.25);
}

.header-inner{
  max-width:1350px;
  margin:auto;
  padding:13px 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
}

.header-brand{
  text-decoration:none;
}

.header-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:18px;
  flex-wrap:wrap;
}

.page-title{
  color:#f4eafa;
  font-size:13px;
  font-weight:700;
}

.main-nav{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
}

.main-nav a{
  color:#fff;
  background:rgba(255,255,255,.10);
  border:1px solid rgba(255,255,255,.16);
  padding:9px 12px;
  border-radius:7px;
  text-decoration:none;
  font-size:12px;
  font-weight:700;
  transition:.2s;
}

.main-nav a:hover,
.main-nav a.active{
  background:var(--gold);
  color:var(--purple-dark);
}

/* =========================================================
   PAGE
========================================================= */

main{
  width:100%;
  max-width:1350px;
  margin:auto;
  padding:25px 18px 45px;
}

.card{
  background:#fff;
  padding:22px;
  border-radius:14px;
  border:1px solid var(--border);
  box-shadow:0 4px 18px rgba(59,11,92,.07);
  margin-bottom:18px;
}

.card h2{
  margin-top:0;
  color:var(--purple-dark);
}

.card h3{
  color:var(--purple);
}

/* =========================================================
   BRAND HERO
========================================================= */

.brand-hero{
  background:
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );
  color:white;
  padding:28px;
  border-radius:16px;
  margin-bottom:20px;
  position:relative;
  overflow:hidden;
  box-shadow:0 8px 25px rgba(59,11,92,.18);
}

.brand-hero:after{
  content:"";
  position:absolute;
  width:190px;
  height:190px;
  right:-70px;
  top:-80px;
  border-radius:50%;
  background:rgba(244,196,48,.15);
}

.brand-hero h1{
  margin:0;
  font-size:30px;
  position:relative;
  z-index:1;
}

.brand-hero h1 span{
  color:var(--gold);
}

.brand-hero p{
  margin:9px 0 0;
  color:#f2eaf6;
  position:relative;
  z-index:1;
}

.gold-line{
  width:70px;
  height:4px;
  background:var(--gold);
  border-radius:5px;
  margin:14px 0;
}

/* =========================================================
   GRID
========================================================= */

.grid{
  display:grid;
  grid-template-columns:
    repeat(auto-fit,minmax(180px,1fr));
  gap:15px;
  margin-bottom:20px;
}

.stat{
  background:#fff;
  padding:20px;
  border-radius:13px;
  border-left:5px solid var(--purple);
  box-shadow:0 3px 15px rgba(0,0,0,.06);
}

.stat h3{
  margin:0;
  font-size:13px;
  color:var(--muted);
  font-weight:700;
}

.stat strong{
  display:block;
  font-size:29px;
  color:var(--purple-dark);
  margin-top:8px;
}

/* =========================================================
   TABLES
========================================================= */

.table-wrap{
  overflow-x:auto;
  border-radius:10px;
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:850px;
}

th,
td{
  padding:12px;
  border-bottom:1px solid #eee;
  text-align:left;
  vertical-align:top;
}

th{
  background:var(--purple-dark);
  color:#fff;
  font-size:12px;
}

tr:hover td{
  background:#fcfaff;
}

/* =========================================================
   BUTTONS
========================================================= */

.btn{
  display:inline-block;
  padding:10px 14px;
  border-radius:8px;
  text-decoration:none;
  border:0;
  cursor:pointer;
  font-weight:800;
  font-size:13px;
  background:var(--purple);
  color:#fff;
}

.btn:hover{
  background:var(--purple-dark);
}

.btn.gold{
  background:var(--gold);
  color:var(--purple-dark);
}

.btn.green{
  background:var(--green);
  color:#fff;
}

.btn.red{
  background:var(--red);
  color:#fff;
}

.btn.blue{
  background:var(--blue);
  color:#fff;
}

.btn.orange{
  background:var(--orange);
  color:#fff;
}

.btn.gray{
  background:#666;
  color:#fff;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

/* =========================================================
   BADGES
========================================================= */

.badge{
  display:inline-block;
  padding:5px 9px;
  border-radius:20px;
  background:#eee;
  font-size:11px;
  font-weight:800;
}

.badge.success{
  background:#dff5e7;
  color:#146c2e;
}

.badge.warning{
  background:#fff0d2;
  color:#8a5700;
}

.badge.danger{
  background:#ffe0e0;
  color:#a00000;
}

.badge.info{
  background:#e1efff;
  color:#145a9c;
}

.badge.brand{
  background:#f0e5f7;
  color:var(--purple-dark);
}

/* =========================================================
   FORMS
========================================================= */

.form-grid{
  display:grid;
  grid-template-columns:
    repeat(auto-fit,minmax(220px,1fr));
  gap:15px;
}

label{
  display:block;
  font-weight:800;
  font-size:13px;
  margin-bottom:6px;
  color:var(--purple-dark);
}

input,
select,
textarea{
  width:100%;
  padding:12px;
  border:1px solid #d5ccd9;
  border-radius:8px;
  font-size:15px;
  background:#fff;
}

input:focus,
select:focus,
textarea:focus{
  outline:none;
  border-color:var(--purple);
  box-shadow:0 0 0 3px rgba(91,22,139,.10);
}

textarea{
  min-height:110px;
  resize:vertical;
}

.notice{
  padding:14px;
  border-radius:9px;
  background:#f3eafa;
  border-left:4px solid var(--purple);
  margin-bottom:17px;
}

.empty{
  text-align:center;
  padding:30px;
  color:var(--muted);
}

.amount{
  color:var(--purple-dark);
  font-weight:900;
  font-size:18px;
}

/* =========================================================
   LOGIN
========================================================= */

.login-page{
  min-height:100vh;
  background:
    radial-gradient(
      circle at 15% 20%,
      rgba(244,196,48,.18),
      transparent 30%
    ),
    linear-gradient(
      135deg,
      #2b073f,
      #5b168b 55%,
      #3b0b5c
    );
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
}

.login-shell{
  width:100%;
  max-width:450px;
}

.login-brand{
  text-align:center;
  margin-bottom:22px;
}

.login-brand .brand-lockup{
  justify-content:center;
}

.login-brand .brand-name{
  font-size:24px;
}

.login-brand .brand-tagline{
  font-size:11px;
}

.login-card{
  background:#fff;
  border-radius:18px;
  padding:30px;
  box-shadow:0 20px 55px rgba(0,0,0,.28);
  border-top:6px solid var(--gold);
}

.login-card h1{
  text-align:center;
  margin:0;
  color:var(--purple-dark);
  font-size:24px;
}

.login-subtitle{
  text-align:center;
  color:#777;
  margin:8px 0 25px;
}

.login-btn{
  width:100%;
  margin-top:22px;
  padding:14px;
  border:0;
  border-radius:9px;
  background:var(--purple);
  color:#fff;
  font-size:16px;
  font-weight:900;
  cursor:pointer;
}

.login-btn:hover{
  background:var(--purple-dark);
}

.login-footer{
  text-align:center;
  margin-top:20px;
  color:#aaa;
  font-size:11px;
}

.error{
  background:#ffe5e5;
  color:#a00000;
  padding:12px;
  border-radius:8px;
  margin-bottom:15px;
  text-align:center;
}

/* =========================================================
   MOBILE
========================================================= */

@media(max-width:760px){

  .header-inner{
    flex-direction:column;
    align-items:flex-start;
  }

  .header-right{
    width:100%;
    align-items:flex-start;
    flex-direction:column;
  }

  .main-nav{
    width:100%;
  }

  .main-nav a{
    flex:1;
    text-align:center;
  }

  main{
    padding:15px 10px 35px;
  }

  .brand-hero{
    padding:22px;
  }

  .brand-hero h1{
    font-size:24px;
  }

  .card{
    padding:17px;
  }

  .grid{
    grid-template-columns:1fr 1fr;
  }

}

@media(max-width:430px){

  .grid{
    grid-template-columns:1fr;
  }

  .brand-name{
    font-size:16px;
  }

  .brand-mark{
    width:43px;
    height:43px;
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
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sibakane T & O Auto</title>
${baseStyles()}
</head>

<body>

<div class="login-page">

  <div class="login-shell">

    <div class="login-brand">
      ${brandLogo()}
    </div>

    <div class="login-card">

      <h1>Welcome Back</h1>

      <div class="login-subtitle">
        Secure Management System
      </div>

      ${
        error
          ? `
          <div class="error">
            ${escapeHtml(error)}
          </div>
          `
          : ""
      }

      <form method="POST" action="/login">

        <label>Email</label>

        <input
          type="email"
          name="email"
          required
          autocomplete="username"
          placeholder="Enter your email"
        >

        <br><br>

        <label>Password</label>

        <input
          type="password"
          name="password"
          required
          autocomplete="current-password"
          placeholder="Enter your password"
        >

        <button class="login-btn" type="submit">
          LOGIN
        </button>

      </form>

      <div class="login-footer">
        SIBAKANE T & O AUTO
        <br>
        Your Journey. Our Commitment.
      </div>

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
    users: results[0]?.total || 0,
    hunters: results[1]?.total || 0,
    dealerships: results[2]?.total || 0,
    leads: results[3]?.total || 0,
    statuses: results[4]?.results || [],
    commissions: results[5] || {},
    recentLeads: results[6]?.results || [],
    activity: results[7]?.results || []
  };
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function adminDashboard(user, data) {

  const statusCards = data.statuses.length
    ? data.statuses.map((item) => `
      <div class="stat">
        <h3>${escapeHtml(statusLabel(item.status))}</h3>
        <strong>${item.total}</strong>
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
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Dashboard | Sibakane T & O Auto</title>
${baseStyles()}
</head>

<body>

${brandedHeader("Admin Control Centre", [
  { href:"/admin", label:"Dashboard", active:true },
  { href:"/admin/leads", label:"Leads" },
  { href:"/admin/hunters", label:"Hunters" },
  { href:"/admin/dealerships", label:"Dealerships" },
  { href:"/admin/users", label:"Users" },
  { href:"/logout", label:"Logout" }
])}

<main>

<div class="brand-hero">

  <h1>
    SIBAKANE <span>T & O</span> AUTO
  </h1>

  <div class="gold-line"></div>

  <p>
    Admin Control Centre · Your Journey. Our Commitment.
  </p>

</div>

<div class="card">

  <h2>Welcome, ${escapeHtml(user.name)}</h2>

  <p>
    You have full administrative control over leads,
    hunters, dealerships and commission management.
  </p>

  <span class="badge success">
    ● SYSTEM ONLINE
  </span>

</div>

<div class="grid">

  <div class="stat">
    <h3>Total Users</h3>
    <strong>${data.users}</strong>
  </div>

  <div class="stat">
    <h3>Active Hunters</h3>
    <strong>${data.hunters}</strong>
  </div>

  <div class="stat">
    <h3>Active Dealerships</h3>
    <strong>${data.dealerships}</strong>
  </div>

  <div class="stat">
    <h3>Total Leads</h3>
    <strong>${data.leads}</strong>
  </div>

  <div class="stat">
    <h3>Payable Commission</h3>
    <strong>
      R${Number(data.commissions.payable_total || 0).toFixed(2)}
    </strong>
  </div>

  <div class="stat">
    <h3>Paid Commission</h3>
    <strong>
      R${N
