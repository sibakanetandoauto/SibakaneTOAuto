import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   BRAND:
   "Connecting you to your dream car without the hustle"
   ========================================================= */

const BRAND = {
  name: "Sibakane T & O Auto",
  tagline: "Connecting you to your dream car without the hustle",
  purple: "#4B176D",
  purpleDark: "#32104B",
  purpleLight: "#6F2A91",
  gold: "#F4C430",
  goldDark: "#D4A900",
  white: "#FFFFFF",
  charcoal: "#211F24",
  light: "#F7F4FA"
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
   AUTH
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
   BRANDING / SHARED CSS
========================================================= */

function baseStyles() {
  return `
<style>

:root{
  --purple:${BRAND.purple};
  --purple-dark:${BRAND.purpleDark};
  --purple-light:${BRAND.purpleLight};
  --gold:${BRAND.gold};
  --gold-dark:${BRAND.goldDark};
  --white:${BRAND.white};
  --charcoal:${BRAND.charcoal};
  --light:${BRAND.light};
  --border:#e7deeb;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:var(--light);
  color:var(--charcoal);
}

/* ================= BRAND HEADER ================= */

.site-header{
  background:
    linear-gradient(
      135deg,
      var(--purple-dark),
      var(--purple)
    );
  color:white;
  border-bottom:5px solid var(--gold);
  box-shadow:0 5px 20px rgba(50,16,75,.20);
}

.header-inner{
  max-width:1300px;
  margin:auto;
  padding:15px 18px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:20px;
}

.brand{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
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
  font-size:20px;
  font-weight:900;
  box-shadow:0 3px 10px rgba(0,0,0,.20);
  flex-shrink:0;
}

.brand-text{
  min-width:0;
}

.brand-name{
  font-size:20px;
  font-weight:900;
  line-height:1.1;
  letter-spacing:.2px;
}

.brand-tagline{
  color:#fff;
  opacity:.92;
  font-size:11px;
  margin-top:4px;
}

nav{
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:7px;
}

nav a{
  display:inline-block;
  padding:9px 12px;
  border-radius:8px;
  color:white;
  text-decoration:none;
  background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.15);
  font-size:13px;
  font-weight:700;
}

nav a:hover{
  background:var(--gold);
  color:var(--purple-dark);
}

/* ================= MAIN ================= */

main{
  width:100%;
  max-width:1300px;
  margin:auto;
  padding:25px 17px 45px;
}

.card{
  background:white;
  padding:22px;
  border-radius:15px;
  box-shadow:0 4px 18px rgba(50,16,75,.07);
  border:1px solid var(--border);
  margin-bottom:18px;
}

.card h2{
  color:var(--purple-dark);
  margin-top:0;
}

.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:15px;
  margin-bottom:20px;
}

.stat{
  background:white;
  padding:19px;
  border-radius:14px;
  border:1px solid var(--border);
  border-top:5px solid var(--gold);
  box-shadow:0 4px 15px rgba(50,16,75,.06);
}

.stat h3{
  margin:0;
  color:#777;
  font-size:13px;
}

.stat strong{
  display:block;
  color:var(--purple);
  font-size:28px;
  margin-top:8px;
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:850px;
}

th,td{
  padding:12px;
  border-bottom:1px solid #eee;
  text-align:left;
  vertical-align:top;
}

th{
  background:var(--purple-dark);
  color:white;
  font-size:13px;
}

.table-wrap{
  overflow-x:auto;
  border-radius:10px;
}

.badge{
  display:inline-block;
  padding:5px 9px;
  border-radius:20px;
  background:#eee;
  font-size:12px;
  font-weight:800;
}

.success{
  background:#dff5e7;
  color:#146c2e;
}

.warning{
  background:#fff0d2;
  color:#8a5700;
}

.danger{
  background:#ffe0e0;
  color:#a00000;
}

.info{
  background:#e7dcf1;
  color:var(--purple-dark);
}

.form-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:15px;
}

label{
  display:block;
  font-weight:800;
  font-size:13px;
  margin-bottom:7px;
  color:var(--purple-dark);
}

input,
select,
textarea{
  width:100%;
  padding:12px;
  border:1px solid #ccc;
  border-radius:8px;
  font:inherit;
  background:white;
}

input:focus,
select:focus,
textarea:focus{
  outline:3px solid rgba(244,196,48,.25);
  border-color:var(--purple);
}

textarea{
  min-height:105px;
  resize:vertical;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

.btn{
  display:inline-block;
  padding:10px 14px;
  border-radius:8px;
  border:0;
  text-decoration:none;
  font-weight:800;
  cursor:pointer;
  font-size:13px;
  background:var(--purple);
  color:white;
}

.btn:hover{
  background:var(--purple-dark);
}

.btn.gold{
  background:var(--gold);
  color:var(--purple-dark);
}

.btn.green{
  background:#198754;
  color:white;
}

.btn.red{
  background:#c62828;
  color:white;
}

.btn.blue{
  background:#1565c0;
  color:white;
}

.btn.gray{
  background:#666;
  color:white;
}

.notice{
  padding:14px;
  border-radius:9px;
  background:#f3ebf7;
  border-left:5px solid var(--gold);
  margin-bottom:16px;
}

.empty{
  text-align:center;
  padding:28px;
  color:#777;
}

.amount{
  font-size:18px;
  font-weight:900;
  color:var(--purple);
}

.page-title{
  color:var(--purple-dark);
  margin-bottom:5px;
}

.section-label{
  color:var(--purple);
  font-weight:900;
  text-transform:uppercase;
  font-size:11px;
  letter-spacing:1px;
}

.footer-brand{
  text-align:center;
  padding:25px 15px;
  color:#777;
  font-size:12px;
}

.footer-brand strong{
  color:var(--purple);
}

@media(max-width:700px){

  .header-inner{
    flex-direction:column;
    align-items:stretch;
  }

  .brand{
    justify-content:center;
  }

  nav{
    justify-content:center;
  }

  nav a{
    font-size:12px;
    padding:8px 10px;
  }

  main{
    padding:16px 10px 35px;
  }

  .card{
    padding:16px;
    border-radius:12px;
  }

  .brand-name{
    font-size:18px;
  }

  .brand-tagline{
    font-size:10px;
  }

}

</style>
`;
}

/* =========================================================
   BRAND HEADER
========================================================= */

function brandedHeader(title, links = []) {
  return `
<header class="site-header">

<div class="header-inner">

<div class="brand">

<div class="brand-mark">
S
</div>

<div class="brand-text">

<div class="brand-name">
${escapeHtml(BRAND.name)}
</div>

<div class="brand-tagline">
${escapeHtml(BRAND.tagline)}
</div>

</div>

</div>

<nav>

${links.map(
  ([href,label]) =>
    `<a href="${href}">${escapeHtml(label)}</a>`
).join("")}

</nav>

</div>

</header>
`;
}

function footer() {
  return `
<div class="footer-brand">
<strong>${escapeHtml(BRAND.name)}</strong>
<br>
${escapeHtml(BRAND.tagline)}
</div>
`;
}

/* =========================================================
   LOGIN
========================================================= */

function loginPage(error = "") {
  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${escapeHtml(BRAND.name)} — Login</title>

${baseStyles()}

<style>

body{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  background:
    radial-gradient(
      circle at top left,
      #6f2a91 0,
      #4b176d 38%,
      #32104b 100%
    );
}

.login-shell{
  width:100%;
  max-width:440px;
}

.login-brand{
  text-align:center;
  color:white;
  margin-bottom:20px;
}

.login-mark{
  width:82px;
  height:82px;
  border-radius:22px;
  background:var(--gold);
  color:var(--purple-dark);
  display:flex;
  align-items:center;
  justify-content:center;
  margin:0 auto 14px;
  font-size:38px;
  font-weight:900;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
}

.login-brand h1{
  margin:0;
  font-size:27px;
}

.login-brand p{
  margin:8px 0 0;
  font-size:13px;
  opacity:.92;
}

.login-box{
  background:white;
  border-radius:20px;
  padding:28px;
  box-shadow:0 20px 55px rgba(0,0,0,.25);
  border-top:6px solid var(--gold);
}

.login-box h2{
  margin-top:0;
  color:var(--purple-dark);
}

.login-button{
  width:100%;
  padding:14px;
  border:0;
  border-radius:9px;
  background:var(--purple);
  color:white;
  font-size:16px;
  font-weight:900;
  cursor:pointer;
}

.login-button:hover{
  background:var(--purple-dark);
}

.error{
  background:#ffe5e5;
  color:#a00000;
  padding:12px;
  border-radius:8px;
  margin-bottom:15px;
  text-align:center;
  font-size:13px;
}

.login-footer{
  text-align:center;
  color:#777;
  font-size:11px;
  margin-top:18px;
}

</style>

</head>

<body>

<div class="login-shell">

<div class="login-brand">

<div class="login-mark">
S
</div>

<h1>${escapeHtml(BRAND.name)}</h1>

<p>${escapeHtml(BRAND.tagline)}</p>

</div>

<div class="login-box">

<h2>Secure Login</h2>

${
error
? `<div class="error">${escapeHtml(error)}</div>`
: ""
}

<form method="POST" action="/login">

<label>Email</label>

<input
type="email"
name="email"
required
autocomplete="username"
>

<br><br>

<label>Password</label>

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
${escapeHtml(BRAND.name)}
<br>
${escapeHtml(BRAND.tagline)}
</div>

</div>

</div>

</body>
</html>
`;
}

/* =========================================================
   HOME
========================================================= */

app.get("/", async (c) => {

  const user = await getCurrentUser(c);

  if (!user) {
    return c.html(loginPage());
  }

  if (user.role === "admin") {
    return redirect(c, "/admin");
  }

  if (user.role === "hunter") {
    return redirect(c, "/hunter");
  }

  if (user.role === "dealership") {
    return redirect(c, "/dealership");
  }

  return c.text("Unknown account role.", 403);
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/login", async (c) => {

  try {

    const body = await c.req.parseBody();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || "");

    if (!email || !password) {
      return c.html(
        loginPage("Please enter your email and password."),
        400
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await c.env.DB
      .prepare(`
        SELECT
          id,
          name,
          email,
          password_hash,
          role,
          active
        FROM users
        WHERE LOWER(email) = ?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (!user || !user.active) {
      return c.html(
        loginPage("Invalid email or password."),
        401
      );
    }

    if (user.password_hash !== passwordHash) {
      return c.html(
        loginPage("Invalid email or password."),
        401
      );
    }

    const sessionId = crypto.randomUUID();

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO sessions
        (id,user_id,expires_at)
        VALUES (?,?,?)
      `)
      .bind(
        sessionId,
        user.id,
        expiresAt
      )
      .run();

    await logActivity(
      c,
      user.id,
      "login",
      "User logged into the system"
    );

    c.header(
      "Set-Cookie",
      `session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );

    return redirect(c, "/");

  } catch (error) {

    return c.html(
      loginPage("Login system error."),
      500
    );

  }

});

/* =========================================================
   LOGOUT
========================================================= */

app.get("/logout", async (c) => {

  const sessionId = getSessionId(c);
  const user = await getCurrentUser(c);

  if (sessionId) {

    await c.env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(sessionId)
      .run();

  }

  if (user) {

    await logActivity(
      c,
      user.user_id,
      "logout",
      "User logged out"
    );

  }

  c.header(
    "Set-Cookie",
    "session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );

  return redirect(c, "/");
});

/* =========================================================
   ADMIN DASHBOARD
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

function adminDashboard(user, data) {

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${escapeHtml(BRAND.name)} — Admin</title>

${baseStyles()}

</head>

<body>

${brandedHeader("Admin",[
  ["/admin","Dashboard"],
  ["/admin/leads","Leads"],
  ["/admin/hunters","Hunters"],
  ["/admin/dealerships","Dealerships"],
  ["/admin/users","Users"],
  ["/logout","Logout"]
])}

<main>

<div class="card">

<div class="section-label">
Admin Control Centre
</div>

<h2 class="page-title">
Welcome, ${escapeHtml(user.name)}
</h2>

<p>
Manage leads, Hunters, dealerships and commissions from one place.
</p>

<span class="badge success">
● System Online
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
R${Number(data.commissions.paid_total || 0).toFixed(2)}
</strong>
</div>

</div>

<div class="card">

<div class="section-label">
Lead Pipeline
</div>

<h2>Lead Status</h2>

<div class="grid">

${
data.statuses.length
? data.statuses.map(item => `
<div class="stat">
<h3>${escapeHtml(statusLabel(item.status))}</h3>
<strong>${item.total}</strong>
</div>
`).join("")
: `<div class="empty">No leads yet.</div>`
}

</div>

</div>

<div class="card">

<h2>Recent Leads</h2>

<div class="table-wrap">

<table>

<tr>
<th>Reference</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Dealership</th>
<th>Status</th>
<th>Commission</th>
</tr>

${
data.recentLeads.length
? data.recentLeads.map(lead => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>${escapeHtml(lead.customer_name)}</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>
