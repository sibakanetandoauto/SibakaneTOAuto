import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   PRODUCTION LEAD MANAGEMENT SYSTEM
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
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

  return labels[status] || status || "-";
}

function commissionLabel(status) {
  const labels = {
    pending: "Pending",
    payable: "Payable",
    paid: "Paid"
  };

  return labels[status] || status || "Pending";
}

async function getCurrentUser(c) {
  const sessionId = getSessionId(c);

  if (!sessionId) return null;

  const session = await c.env.DB.prepare(`
    SELECT
      sessions.id,
      sessions.user_id,
      sessions.expires_at,
      users.name,
      users.email,
      users.role,
      users.active
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
      AND users.active = 1
    LIMIT 1
  `).bind(sessionId).first();

  if (!session) return null;

  if (
    session.expires_at &&
    new Date(session.expires_at) <= new Date()
  ) {
    await c.env.DB.prepare(
      "DELETE FROM sessions WHERE id = ?"
    ).bind(sessionId).run();

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
  try {
    await c.env.DB.prepare(`
      INSERT INTO activity_log
      (user_id, lead_id, action, details)
      VALUES (?, ?, ?, ?)
    `).bind(
      userId || null,
      leadId || null,
      action,
      details
    ).run();
  } catch (e) {
    console.error("Activity log error:", e);
  }
}

/* =========================================================
   BRANDING
========================================================= */

const BRAND_PURPLE = "#5B2A86";
const BRAND_PURPLE_DARK = "#3E1C5C";
const BRAND_GOLD = "#F2C94C";
const BRAND_GOLD_DARK = "#D9A900";
const BRAND_CHARCOAL = "#252525";

function brandMark() {
  return `
    <div class="brand-mark">
      <div class="brand-icon">S</div>
      <div>
        <div class="brand-name">Sibakane T & O Auto</div>
        <div class="brand-sub">AUTOMOTIVE LEAD MANAGEMENT</div>
      </div>
    </div>
  `;
}

function baseStyles() {
  return `
<style>
:root{
  --purple:#5B2A86;
  --purple-dark:#3E1C5C;
  --gold:#F2C94C;
  --gold-dark:#D9A900;
  --charcoal:#252525;
  --light:#F6F5F8;
  --white:#FFFFFF;
  --border:#E7E3EB;
  --muted:#737373;
  --success:#198754;
  --danger:#C62828;
  --blue:#1565C0;
  --orange:#D97706;
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

header{
  background:linear-gradient(
    135deg,
    var(--purple-dark),
    var(--purple)
  );
  color:white;
  padding:15px 20px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:20px;
  border-bottom:4px solid var(--gold);
  box-shadow:0 4px 15px rgba(0,0,0,.15);
}

.brand-mark{
  display:flex;
  align-items:center;
  gap:11px;
}

.brand-icon{
  width:42px;
  height:42px;
  border-radius:10px;
  background:var(--gold);
  color:var(--purple-dark);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:25px;
  font-weight:900;
  box-shadow:0 2px 8px rgba(0,0,0,.2);
}

.brand-name{
  font-size:18px;
  font-weight:900;
  letter-spacing:.2px;
}

.brand-sub{
  font-size:8px;
  letter-spacing:1.3px;
  color:var(--gold);
  margin-top:3px;
  font-weight:bold;
}

nav{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

nav a{
  display:inline-block;
  padding:9px 12px;
  border-radius:7px;
  color:white;
  background:rgba(255,255,255,.13);
  text-decoration:none;
  font-size:13px;
  font-weight:bold;
  border:1px solid rgba(255,255,255,.1);
}

nav a:hover{
  background:var(--gold);
  color:var(--purple-dark);
}

main{
  max-width:1250px;
  margin:auto;
  padding:22px 16px;
}

.card{
  background:white;
  padding:20px;
  border-radius:13px;
  border:1px solid var(--border);
  box-shadow:0 4px 18px rgba(62,28,92,.06);
  margin-bottom:18px;
}

.card h2{
  margin-top:0;
  color:var(--purple-dark);
}

.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  gap:14px;
  margin-bottom:18px;
}

.stat{
  background:white;
  padding:18px;
  border-radius:13px;
  border-left:5px solid var(--gold);
  border-top:1px solid var(--border);
  border-right:1px solid var(--border);
  border-bottom:1px solid var(--border);
  box-shadow:0 3px 15px rgba(0,0,0,.05);
}

.stat h3{
  margin:0;
  font-size:13px;
  color:var(--muted);
}

.stat strong{
  display:block;
  font-size:27px;
  margin-top:8px;
  color:var(--purple-dark);
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:850px;
}

th,td{
  padding:11px;
  border-bottom:1px solid #eee;
  text-align:left;
  vertical-align:top;
}

th{
  background:#F8F6FA;
  color:var(--purple-dark);
  font-size:13px;
}

.table-wrap{
  overflow-x:auto;
}

.badge{
  display:inline-block;
  padding:5px 8px;
  border-radius:6px;
  background:#EEE;
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

.form-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:14px;
}

label{
  display:block;
  font-weight:bold;
  font-size:13px;
  margin-bottom:6px;
  color:var(--purple-dark);
}

input,select,textarea{
  width:100%;
  padding:12px;
  border:1px solid #CCC;
  border-radius:7px;
  font:inherit;
  background:white;
}

input:focus,
select:focus,
textarea:focus{
  outline:2px solid rgba(242,201,76,.45);
  border-color:var(--purple);
}

textarea{
  min-height:100px;
  resize:vertical;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}

.btn{
  display:inline-block;
  padding:10px 13px;
  border-radius:7px;
  text-decoration:none;
  border:0;
  font-weight:bold;
  cursor:pointer;
  font-size:13px;
}

.btn.primary{
  background:var(--purple);
  color:white;
}

.btn.primary:hover{
  background:var(--purple-dark);
}

.btn.gold{
  background:var(--gold);
  color:var(--purple-dark);
}

.btn.green{
  background:var(--success);
  color:white;
}

.btn.red{
  background:var(--danger);
  color:white;
}

.btn.blue{
  background:var(--blue);
  color:white;
}

.btn.gray{
  background:#666;
  color:white;
}

.notice{
  padding:13px;
  border-radius:8px;
  background:#F0EAF6;
  border-left:4px solid var(--purple);
  margin-bottom:15px;
}

.empty{
  text-align:center;
  padding:25px;
  color:#777;
}

.amount{
  font-weight:bold;
  font-size:18px;
  color:var(--purple-dark);
}

.page-title{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}

.gold-line{
  height:4px;
  width:70px;
  background:var(--gold);
  border-radius:4px;
  margin:8px 0 15px;
}

.footer{
  text-align:center;
  color:#888;
  font-size:12px;
  padding:25px;
}

@media(max-width:700px){

  header{
    align-items:flex-start;
    flex-direction:column;
    padding:14px;
  }

  nav{
    width:100%;
  }

  nav a{
    flex:1;
    text-align:center;
    min-width:90px;
  }

  main{
    padding:14px 9px;
  }

  .card{
    padding:16px;
  }

  .brand-name{
    font-size:16px;
  }

  .stat strong{
    font-size:24px;
  }
}
</style>
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
<title>Sibakane T & O Auto</title>
${baseStyles()}
<style>
.login-page{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  background:
    radial-gradient(circle at top left,#6d3a99 0,#3E1C5C 45%,#21112f 100%);
}

.login-box{
  width:100%;
  max-width:430px;
  background:white;
  border-radius:18px;
  overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.3);
}

.login-top{
  background:linear-gradient(135deg,var(--purple-dark),var(--purple));
  color:white;
  padding:30px 25px;
  text-align:center;
  border-bottom:5px solid var(--gold);
}

.login-logo{
  width:64px;
  height:64px;
  margin:auto;
  background:var(--gold);
  color:var(--purple-dark);
  border-radius:15px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:38px;
  font-weight:900;
}

.login-title{
  margin-top:13px;
  font-size:25px;
  font-weight:900;
}

.login-sub{
  color:var(--gold);
  font-size:10px;
  letter-spacing:1.5px;
  font-weight:bold;
  margin-top:5px;
}

.login-body{
  padding:25px;
}

.login-button{
  width:100%;
  padding:14px;
  margin-top:20px;
  border:0;
  border-radius:8px;
  background:var(--purple);
  color:white;
  font-size:16px;
  font-weight:bold;
  cursor:pointer;
}

.login-button:hover{
  background:var(--purple-dark);
}

.error{
  background:#FFE5E5;
  color:#A00000;
  padding:12px;
  border-radius:8px;
  margin-bottom:15px;
  text-align:center;
}
</style>
</head>

<body>

<div class="login-page">

<div class="login-box">

<div class="login-top">

<div class="login-logo">S</div>

<div class="login-title">
Sibakane T & O Auto
</div>

<div class="login-sub">
AUTOMOTIVE LEAD MANAGEMENT
</div>

</div>

<div class="login-body">

${error ? `
<div class="error">
${escapeHtml(error)}
</div>
` : ""}

<form method="POST" action="/login">

<label>Email</label>

<input
type="email"
name="email"
required
autocomplete="username"
>

<label style="margin-top:16px">
Password
</label>

<input
type="password"
name="password"
required
autocomplete="current-password"
>

<button class="login-button" type="submit">
Login
</button>

</form>

<div class="footer">
Sibakane T & O Auto
</div>

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

  if (!user) return c.html(loginPage());

  if (user.role === "admin") {
    return redirect(c, "/admin");
  }

  if (user.role === "hunter") {
    return redirect(c, "/hunter");
  }

  if (user.role === "dealership") {
    return redirect(c, "/dealership");
  }

  return c.text("Unknown account role.",403);
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

    const user = await c.env.DB.prepare(`
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
    `).bind(email).first();

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

    await c.env.DB.prepare(`
      INSERT INTO sessions
      (id,user_id,expires_at)
      VALUES (?,?,?)
    `).bind(
      sessionId,
      user.id,
      expiresAt
    ).run();

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

    return redirect(c,"/");

  } catch(error) {

    console.error(error);

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
    await c.env.DB.prepare(
      "DELETE FROM sessions WHERE id = ?"
    ).bind(sessionId).run();
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

  return redirect(c,"/");
});

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

app.get("/admin", async (c) => {

  const user = await requireRole(c,"admin");

  if (!user) return redirect(c,"/");
  if (user === false) return c.text("Forbidden",403);

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
      SELECT status,COUNT(*) AS total
      FROM leads
      GROUP BY status
      ORDER BY status
    `).all(),

    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(commission_amount),0) AS total,
        COALESCE(
          SUM(
            CASE
              WHEN commission_status='payable'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS payable,
        COALESCE(
          SUM(
            CASE
              WHEN commission_status='paid'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS paid
      FROM leads
    `).first(),

    c.env.DB.prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id=leads.dealership_id
      ORDER BY leads.id DESC
      LIMIT 10
    `).all(),

    c.env.DB.prepare(`
      SELECT
        activity_log.*,
        users.name AS user_name
      FROM activity_log
      LEFT JOIN users
        ON users.id=activity_log.user_id
      ORDER BY activity_log.id DESC
      LIMIT 10
    `).all()

  ]);

  const statuses = results[4]?.results || [];
  const recentLeads = results[6]?.results || [];
  const activity = results[7]?.results || [];
  const commissions = results[5] || {};

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Dashboard | Sibakane T & O Auto</title>
${baseStyles()}
</head>

<body>

<header>

${brandMark()}

<nav>
<a href="/admin">Dashboard</a>
<a href="/admin/leads">Leads</a>
<a href="/admin/hunters">Hunters</a>
<a href="/admin/dealerships">Dealerships</a>
<a href="/admin/users">Users</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<div class="page-title">

<div>
<h2>Admin Control Centre</h2>
<div class="gold-line"></div>
</div>

<span class="badge success">● System Online</span>

</div>

<p>
Welcome <strong>${escapeHtml(user.name)}</strong>
</p>

</div>

<div class="grid">

<div class="stat">
<h3>Total Users</h3>
<strong>${results[0]?.total || 0}</strong>
</div>

<div class="stat">
<h3>Active Hunters</h3>
<strong>${results[1]?.total || 0}</strong>
</div>

<div class="stat">
<h3>Active Dealerships</h3>
<strong>${results[2]?.total || 0}</strong>
</div>

<div class="stat">
<h3>Total Leads</h3>
<strong>${results[3]?.total || 0}</strong>
</div>

<div class="stat">
<h3>Payable Commission</h3>
<strong>R${Number(commissions.payable || 0).toFixed(2)}</strong>
</div>

<div class="stat">
<h3>Paid Commission</h3>
<strong>R${Number(commissions.paid || 0).toFixed(2)}</strong>
</div>

</div>

<div class="card">

<h2>Lead Status</h2>

<div class="grid">

${
statuses.length
? statuses.map(item => `
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

<div class="page-title">
<h2>Recent Leads</h2>
<a class="btn primary" href="/admin/leads">
Manage All Leads
</a>
</div>

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
recentLeads.length
? recentLeads.map(lead => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>${escapeHtml(lead.customer_name)}</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>

<td>
<span class="badge">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>
R${Number(lead.commission_amount || 0).toFixed(2)}
<br>
<small>
${escapeHtml(commissionLabel(lead.commission_status))}
</small>
</td>

</tr>
`).join("")
: `
<tr>
<td colspan="6" class="empty">
No leads yet.
</td>
</tr>
`
}

</table>

</div>

</div>

<div class="card">

<h2>Recent Activity</h2>

${
activity.length
? activity.map(item => `
<div style="padding:12px 0;border-bottom:1px solid #eee">

<strong>${escapeHtml(item.action)}</strong>

<div>${escapeHtml(item.details || "")}</div>

<small>
${escapeHtml(item.user_name || "System")}
·
${escapeHtml(item.created_at)}
</small>

</div>
`).join("")
: `<div class="empty">No activity yet.</div>`
}

</div>

</main>

</body>
</html>
`);
});

/* =========================================================
   ADMIN LEADS
========================================================= */

app.get("/admin/leads", async (c) => {

  const user = await requireRole(c,"admin");

  if (!user) return redirect(c,"/");
  if (user === false) return c.text("Forbidden",403);

  const leads = await c.env.DB.prepare(`
    SELECT
      leads.*,
      dealerships.name AS dealership_name,
      hunter_users.name AS hunter_name
  
