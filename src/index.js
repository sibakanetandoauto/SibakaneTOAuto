import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   Production workflow:
   HUNTER -> SUBMIT LEAD
   ADMIN  -> REVIEW / APPROVE / DECLINE / ASSIGN / COMMISSION
   DEALER -> WORK LEAD / UPDATE STATUS
   ADMIN  -> MARK COMMISSION PAYABLE / PAID
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

<style>
*{box-sizing:border-box}

body{
margin:0;
min-height:100vh;
font-family:Arial,sans-serif;
background:#f3f4f6;
display:flex;
align-items:center;
justify-content:center;
padding:20px
}

.box{
width:100%;
max-width:420px;
background:#fff;
padding:30px;
border-radius:16px;
box-shadow:0 10px 35px rgba(0,0,0,.12)
}

h1{
margin:0;
font-size:25px;
text-align:center
}

.subtitle{
text-align:center;
color:#777;
margin:8px 0 25px
}

label{
display:block;
font-weight:bold;
margin-top:15px
}

input{
width:100%;
padding:14px;
margin-top:7px;
border:1px solid #ccc;
border-radius:8px;
font-size:16px
}

button{
width:100%;
margin-top:22px;
padding:14px;
border:0;
border-radius:8px;
background:#222;
color:white;
font-size:16px;
font-weight:bold
}

.error{
background:#ffe5e5;
color:#a00000;
padding:12px;
border-radius:8px;
margin-bottom:15px;
text-align:center
}

.footer{
margin-top:20px;
text-align:center;
font-size:12px;
color:#888
}
</style>
</head>

<body>

<div class="box">

<h1>Sibakane T & O Auto</h1>

<div class="subtitle">
Secure Management System
</div>

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

<label>Password</label>

<input
type="password"
name="password"
required
autocomplete="current-password"
>

<button type="submit">
Login
</button>

</form>

<div class="footer">
Sibakane T & O Auto
</div>

</div>

</body>
</html>
`;
}

/* =========================================================
   SHARED UI
========================================================= */

function baseStyles() {
  return `
<style>
*{box-sizing:border-box}

body{
margin:0;
font-family:Arial,sans-serif;
background:#f4f5f7;
color:#222
}

header{
background:#222;
color:#fff;
padding:16px 20px;
display:flex;
justify-content:space-between;
align-items:center;
gap:15px
}

header h1{
margin:0;
font-size:19px
}

nav{
display:flex;
gap:8px;
flex-wrap:wrap
}

nav a,
.btn{
display:inline-block;
padding:9px 12px;
border-radius:7px;
text-decoration:none;
border:0;
font-weight:bold;
cursor:pointer;
font-size:13px
}

nav a{
color:#fff;
background:#444
}

.btn{
background:#222;
color:#fff
}

.btn.green{background:#198754}
.btn.red{background:#c62828}
.btn.orange{background:#d97706}
.btn.blue{background:#1565c0}
.btn.gray{background:#666}

main{
max-width:1250px;
margin:auto;
padding:22px 16px
}

.card{
background:#fff;
padding:20px;
border-radius:12px;
box-shadow:0 3px 15px rgba(0,0,0,.06);
margin-bottom:18px
}

.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
gap:14px;
margin-bottom:18px
}

.stat{
background:#fff;
padding:18px;
border-radius:12px;
box-shadow:0 3px 15px rgba(0,0,0,.06)
}

.stat h3{
margin:0;
font-size:14px;
color:#777
}

.stat strong{
display:block;
font-size:30px;
margin-top:8px
}

table{
width:100%;
border-collapse:collapse;
min-width:850px
}

th,td{
padding:11px;
border-bottom:1px solid #eee;
text-align:left;
vertical-align:top
}

th{
background:#fafafa
}

.table-wrap{
overflow-x:auto
}

.badge{
display:inline-block;
padding:5px 8px;
border-radius:6px;
background:#eee;
font-size:12px;
font-weight:bold
}

.success{
background:#dff5e7;
color:#146c2e
}

.warning{
background:#fff0d2;
color:#8a5700
}

.danger{
background:#ffe0e0;
color:#a00000
}

.info{
background:#e1efff;
color:#145a9c
}

.form-grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
gap:14px
}

label{
display:block;
font-weight:bold;
font-size:13px;
margin-bottom:6px
}

input,select,textarea{
width:100%;
padding:11px;
border:1px solid #ccc;
border-radius:7px;
font:inherit
}

textarea{
min-height:100px;
resize:vertical
}

.actions{
display:flex;
gap:7px;
flex-wrap:wrap
}

.empty{
text-align:center;
padding:25px;
color:#777
}

.notice{
padding:13px;
border-radius:8px;
background:#eef4ff;
margin-bottom:15px
}

.amount{
font-weight:bold;
font-size:18px
}

@media(max-width:600px){
header{
align-items:flex-start;
flex-direction:column
}

main{
padding:15px 10px
}
}
</style>
`;
}

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

  const statusCards = data.statuses.length
    ? data.statuses.map((item) => `
<div class="stat">
<h3>${escapeHtml(statusLabel(item.status))}</h3>
<strong>${item.total}</strong>
</div>
`).join("")
    : `<div class="card empty">No leads yet.</div>`;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Dashboard</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Sibakane T & O Auto</h1>

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

<h2>Admin Control Centre</h2>

<p>
Welcome <strong>${escapeHtml(user.name)}</strong>
</p>

<p>
${escapeHtml(user.email)}
</p>

<p>
<span class="badge success">● System Online</span>
</p>

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
<strong>R${Number(data.commissions.payable_total || 0).toFixed(2)}</strong>
</div>

<div class="stat">
<h3>Paid Commission</h3>
<strong>R${Number(data.commissions.paid_total || 0).toFixed(2)}</strong>
</div>

</div>

<div class="card">

<h2>Lead Status</h2>

<div class="grid">
${statusCards}
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
? data.recentLeads.map((lead) => `
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
data.activity.length
? data.activity.map((item) => `
<div style="padding:12px 0;border-bottom:1px solid #eee">

<strong>${escapeHtml(item.action)}</strong>

<div>
${escapeHtml(item.details || "")}
</div>

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
    const data = await getDashboardData(c);
    return c.html(adminDashboard(user, data));
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
   ADMIN LEAD CONTROL
========================================================= */

app.get("/admin/leads", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const leads = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name,
        hunter_users.name AS hunter_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      LEFT JOIN hunters
        ON hunters.id = leads.hunter_id
      LEFT JOIN users AS hunter_users
        ON hunter_users.id = hunters.user_id
      ORDER BY leads.id DESC
    `)
    .all();

  const dealerships = await c.env.DB
    .prepare(`
      SELECT id,name
      FROM dealerships
      WHERE active = 1
      ORDER BY name
    `)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lead Control</title>
${baseStyles()}
</head>

<body>

<header>
<h1>Lead Control</h1>

<nav>
<a href="/admin">Dashboard</a>
<a href="/logout">Logout</a>
</nav>
</header>

<main>

<div class="card">

<h2>Lead Control Centre</h2>

<p>
Every lead submitted by a Hunter must be reviewed by Admin before dealership assignment.
</p>

</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Lead</th>
<th>Hunter</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Dealership</th>
<th>Status</th>
<th>Commission</th>
<th>Actions</th>
</tr>

${
leads.results.length
? leads.results.map((lead) => `
<tr>

<td>
<strong>${escapeHtml(lead.lead_reference)}</strong>
<br>
<small>${escapeHtml(lead.created_at)}</small>
</td>

<td>${escapeHtml(lead.hunter_name || "-")}</td>

<td>
${escapeHtml(lead.customer_name)}
<br>
${escapeHtml(lead.customer_phone)}
</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>

<td>
<span class="badge">
${escapeHtml(statusLabel(lead.status))}
</span>
<br>
<small>
Commission:
${escapeHtml(commissionLabel(lead.commission_status))}
</small>
</td>

<td>
R${Number(lead.commission_amount || 0).toFixed(2)}
</td>

<td>

<div class="actions">

<a
class="btn"
href="/admin/leads/${lead.id}"
>
Manage
</a>

</div>

</td>

</tr>
`).join("")
: `
<tr>
<td colspan="8" class="empty">
No leads have been submitted.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   ADMIN SINGLE LEAD
========================================================= */

app.get("/admin/leads/:id", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = Number(c.req.param("id"));

  const lead = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name,
        hunter_users.name AS hunter_name,
        hunter_users.email AS hunter_email
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      LEFT JOIN hunters
        ON hunters.id = leads.hunter_id
      LEFT JOIN users AS hunter_users
        ON hunter_users.id = hunters.user_id
      WHERE leads.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.text("Lead not found.", 404);
  }

  const dealerships = await c.env.DB
    .prepare(`
      SELECT id,name
      FROM dealerships
      WHERE active = 1
      ORDER BY name
    `)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manage Lead</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Manage Lead</h1>

<nav>
<a href="/admin/leads">Back to Leads</a>
<a href="/admin">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>${escapeHtml(lead.lead_reference)}</h2>

<div class="grid">

<div>
<strong>Customer</strong>
<p>${escapeHtml(lead.customer_name)}</p>
</div>

<div>
<strong>Phone</strong>
<p>${escapeHtml(lead.customer_phone)}</p>
</div>

<div>
<strong>Vehicle</strong>
<p>${escapeHtml(lead.vehicle_interest || "-")}</p>
</div>

<div>
<strong>Hunter</strong>
<p>${escapeHtml(lead.hunter_name || "-")}</p>
</div>

<div>
<strong>Current Status</strong>
<p>
<span class="badge">
${escapeHtml(statusLabel(lead.status))}
</span>
</p>
</div>

<div>
<strong>Commission</strong>
<p class="amount">
R${Number(lead.commission_amount || 0).toFixed(2)}
</p>
</div>

</div>

</div>

<div class="card">

<h2>Admin Decision</h2>

<form method="POST" action="/admin/leads/${lead.id}/review">

<div class="form-grid">

<div>

<label>Lead Decision</label>

<select name="decision" required>

<option value="">Select</option>

<option value="approve">
Approve Lead
</option>

<option value="decline">
Decline Lead
</option>

</select>

</div>

<div>

<label>Dealership</label>

<select name="dealership_id">

<option value="">Unassigned</option>

${
dealerships.results.map((dealer) => `
<option
value="${dealer.id}"
${Number(lead.dealership_id) === Number(dealer.id) ? "selected" : ""}
>
${escapeHtml(dealer.name)}
</option>
`).join("")
}

</select>

</div>

<div>

<label>Hunter Commission (R)</label>

<input
type="number"
name="commission_amount"
min="0"
step="0.01"
value="${Number(lead.commission_amount || 0).toFixed(2)}"
>

</div>

</div>

<br>

<button class="btn green" type="submit">
Save Admin Decision
</button>

</form>

</div>

<div class="card">

<h2>Commission Control</h2>

<p>
Current commission status:
<strong>
${escapeHtml(commissionLabel(lead.commission_status))}
</strong>
</p>

<p>
<strong>Important:</strong>
Commission can only become Payable after the dealership has paid.
</p>

${
lead.dealership_id && lead.status !== "declined"
? `
<form method="POST" action="/admin/leads/${lead.id}/commission">

<div class="form-grid">

<div>

<label>Commission Status</label>

<select name="commission_status" required>

<option
value="pending"
${lead.commission_status === "pending" ? "selected" : ""}
>
Pending
</option>

<option
value="payable"
${lead.commission_status === "payable" ? "selected" : ""}
>
Payable
</option>

<option
value="paid"
${lead.commission_status === "paid" ? "selected" : ""}
>
Paid
</option>

</select>

</div>

</div>

<br>

<button class="btn blue" type="submit">
Update Commission Status
</button>

</form>
`
: `
<div class="notice">
Assign the lead to a dealership before managing commission.
</div>
`
}

</div>

<div class="card">

<h2>Lead Notes</h2>

<p>
${escapeHtml(lead.notes || "No notes provided.")}
</p>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   ADMIN REVIEW / ASSIGN / COMMISSION
========================================================= */

app.post("/admin/leads/:id/review", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = Number(c.req.param("id"));

  const body = await c.req.parseBody();

  const decision = String(body.decision || "");

  const dealershipIdRaw =
    String(body.dealership_id || "").trim();

  const dealershipId =
    dealershipIdRaw ? Number(dealershipIdRaw) : null;

  const commissionAmount =
    Math.max(
      0,
      Number(body.commission_amount || 0)
    );

  const lead = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.text("Lead not found.", 404);
  }

  if (!["approve", "decline"].includes(decision)) {
    return c.text("Invalid decision.", 400);
  }

  if (
    decision === "approve" &&
    dealershipId
  ) {

    const dealer = await c.env.DB
      .prepare(`
        SELECT id,name
        FROM dealerships
        WHERE id = ?
          AND active = 1
        LIMIT 1
      `)
      .bind(dealershipId)
      .first();

    if (!dealer) {
      return c.text("Selected dealership is invalid.", 400);
    }
  }

  if (decision === "decline") {

    await c.env.DB
      .prepare(`
        UPDATE leads
        SET
          status = 'declined',
          dealership_id = NULL,
          approved_at = NULL,
          assigned_at = NULL,
          commission_amount = 0,
          commission_status = 'pending',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(now(), id)
      .run();

    await logActivity(
      c,
      user.user_id,
      "lead_declined",
      `Lead ${lead.lead_reference} declined by Admin`,
      id
    );

  } else {

    const assigned =
      dealershipId ? "assigned" : "approved";

    await c.env.DB
      .prepare(`
        UPDATE leads
        SET
          status = ?,
          dealership_id = ?,
          approved_at = ?,
          assigned_at = ?,
          commission_amount = ?,
          commission_status = 'pending',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        assigned,
        dealershipId,
        now(),
        dealershipId ? now() : null,
        commissionAmount,
        now(),
        id
      )
      .run();

    await logActivity(
      c,
      user.user_id,
      dealershipId
        ? "lead_approved_assigned"
        : "lead_approved",
      dealershipId
        ? `Lead ${lead.lead_reference} approved and assigned to dealership. Commission set to R${commissionAmount.toFixed(2)}.`
        : `Lead ${lead.lead_reference} approved. Awaiting dealership assignment.`,
      id
    );

  }

  return redirect(c, `/admin/leads/${id}`);
});

/* =========================================================
   ADMIN COMMISSION STATUS
========================================================= */

app.post("/admin/leads/:id/commission", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = Number(c.req.param("id"));

  const body = await c.req.parseBody();

  const commissionStatus =
    String(body.commission_status || "");

  if (
    !["pending", "payable", "paid"]
      .includes(commissionStatus)
  ) {
    return c.text("Invalid commission status.", 400);
  }

  const lead = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.text("Lead not found.", 404);
  }

  if (!lead.dealership_id) {
    return c.text(
      "Lead must be assigned to a dealership first.",
      400
    );
  }

  /*
    PAYABLE means dealership has paid.
    Admin is responsible for confirming this.
  */

  if (
    commissionStatus === "payable" &&
    lead.commission_amount <= 0
  ) {
    return c.text(
      "Commission amount must be greater than zero.",
      400
    );
  }

  if (
    commissionStatus === "paid" &&
    lead.commission_status !== "payable"
  ) {
    return c.text(
      "Commission must first be marked Payable after dealership payment.",
      400
    );
  }

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET
        commission_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      commissionStatus,
      now(),
      id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    "commission_status_changed",
    `Lead ${lead.lead_reference} commission changed to ${commissionStatus}.`,
    id
  );

  return redirect(c, `/admin/leads/${id}`);
});

/* =========================================================
   ADMIN HUNTERS
========================================================= */

app.get("/admin/hunters", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const hunters = await c.env.DB
    .prepare(`
      SELECT
        hunters.id,
        hunters.phone,
        hunters.active,
        hunters.created_at,
        users.name,
        users.email,
        COUNT(leads.id) AS lead_count,
        COALESCE(SUM(leads.commission_amount),0) AS commission_total,
        COALESCE(
          SUM(
            CASE
              WHEN leads.commission_status = 'payable'
              THEN leads.commission_amount
              ELSE 0
            END
          ),0
        ) AS payable_total,
        COALESCE(
          SUM(
            CASE
              WHEN leads.commission_status = 'paid'
              THEN leads.commission_amount
              ELSE 0
            END
          ),0
        ) AS paid_total
      FROM hunters
      JOIN users
        ON users.id = hunters.user_id
      LEFT JOIN leads
        ON leads.hunter_id = hunters.id
      GROUP BY
        hunters.id,
        hunters.phone,
        hunters.active,
        hunters.created_at,
        users.name,
        users.email
      ORDER BY hunters.id DESC
    `)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lead Hunters</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Lead Hunters</h1>

<nav>
<a href="/admin">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>Lead Hunter Management</h2>

<p>
Hunters are added manually by Admin. There is no public Hunter recruitment or application system.
</p>

</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Hunter</th>
<th>Contact</th>
<th>Status</th>
<th>Leads</th>
<th>Total Commission</th>
<th>Payable</th>
<th>Paid</th>
</tr>

${
hunters.results.length
? hunters.results.map((hunter) => `
<tr>

<td>
<strong>${escapeHtml(hunter.name)}</strong>
<br>
${escapeHtml(hunter.email)}
</td>

<td>${escapeHtml(hunter.phone || "-")}</td>

<td>
<span class="badge ${hunter.active ? "success" : "danger"}">
${hunter.active ? "Active" : "Inactive"}
</span>
</td>

<td>${hunter.lead_count}</td>

<td>R${Number(hunter.commission_total || 0).toFixed(2)}</td>

<td>R${Number(hunter.payable_total || 0).toFixed(2)}</td>

<td>R${Number(hunter.paid_total || 0).toFixed(2)}</td>

</tr>
`).join("")
: `
<tr>
<td colspan="7" class="empty">
No hunters registered.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   ADMIN DEALERSHIPS
========================================================= */

app.get("/admin/dealerships", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const dealerships = await c.env.DB
    .prepare(`
      SELECT
        dealerships.*,
        COUNT(leads.id) AS lead_count
      FROM dealerships
      LEFT JOIN leads
        ON leads.dealership_id = dealerships.id
      GROUP BY dealerships.id
      ORDER BY dealerships.id DESC
    `)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dealerships</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Dealerships</h1>

<nav>
<a href="/admin">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>Dealership Management</h2>

<p>
Dealerships receive approved leads assigned by Admin and can update the progress of those leads.
</p>

</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Dealership</th>
<th>Contact</th>
<th>Email</th>
<th>Phone</th>
<th>Leads</th>
<th>Status</th>
</tr>

${
dealerships.results.length
? dealerships.results.map((dealer) => `
<tr>

<td>${escapeHtml(dealer.name)}</td>

<td>${escapeHtml(dealer.contact_name || "-")}</td>

<td>${escapeHtml(dealer.email || "-")}</td>

<td>${escapeHtml(dealer.phone || "-")}</td>

<td>${dealer.lead_count}</td>

<td>
<span class="badge ${dealer.active ? "success" : "danger"}">
${dealer.active ? "Active" : "Inactive"}
</span>
</td>

</tr>
`).join("")
: `
<tr>
<td colspan="6" class="empty">
No dealerships registered.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   ADMIN USERS
========================================================= */

app.get("/admin/users", async (c) => {

  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const users = await c.env.DB
    .prepare(`
      SELECT
        id,
        name,
        email,
        role,
        active,
        created_at
      FROM users
      ORDER BY id DESC
    `)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Users</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Users</h1>

<nav>
<a href="/admin">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>System Users</h2>

<div class="table-wrap">

<table>

<tr>
<th>Name</th>
<th>Email</th>
<th>Role</th>
<th>Status</th>
<th>Created</th>
</tr>

${
users.results.length
? users.results.map((account) => `
<tr>

<td>${escapeHtml(account.name)}</td>

<td>${escapeHtml(account.email)}</td>

<td>
<span class="badge">
${escapeHtml(account.role)}
</span>
</td>

<td>
${account.active ? "Active" : "Inactive"}
</td>

<td>${escapeHtml(account.created_at)}</td>

</tr>
`).join("")
: `
<tr>
<td colspan="5" class="empty">
No users found.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   HUNTER DASHBOARD
========================================================= */

app.get("/hunter", async (c) => {

  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT id
      FROM hunters
      WHERE user_id = ?
        AND active = 1
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text(
      "Your Hunter account is not active.",
      403
    );
  }

  const leads = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      WHERE leads.hunter_id = ?
      ORDER BY leads.id DESC
    `)
    .bind(hunter.id)
    .all();

  const totals = await c.env.DB
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(commission_amount),0) AS total_commission,
        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'payable'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS payable,
        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'paid'
              THEN commission_amount
              ELSE 0
            END
          ),0
        ) AS paid
      FROM leads
      WHERE hunter_id = ?
    `)
    .bind(hunter.id)
    .first();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hunter Dashboard</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Sibakane T & O Auto</h1>

<nav>
<a href="/hunter">Dashboard</a>
<a href="/hunter/leads/new">Add Lead</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>Lead Hunter Dashboard</h2>

<p>
Welcome <strong>${escapeHtml(user.name)}</strong>
</p>

<p>
You submit leads here and track their progress and commission status.
</p>

</div>

<div class="grid">

<div class="stat">
<h3>Total Leads</h3>
<strong>${totals?.total || 0}</strong>
</div>

<div class="stat">
<h3>Total Commission</h3>
<strong>R${Number(totals?.total_commission || 0).toFixed(2)}</strong>
</div>

<div class="stat">
<h3>Payable</h3>
<strong>R${Number(totals?.payable || 0).toFixed(2)}</strong>
</div>

<div class="stat">
<h3>Paid</h3>
<strong>R${Number(totals?.paid || 0).toFixed(2)}</strong>
</div>

</div>

<div class="card">

<h2>My Leads</h2>

<div class="table-wrap">

<table>

<tr>
<th>Lead</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Status</th>
<th>Dealership</th>
<th>Commission</th>
</tr>

${
leads.results.length
? leads.results.map((lead) => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>
${escapeHtml(lead.customer_name)}
<br>
${escapeHtml(lead.customer_phone)}
</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>
<span class="badge">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>
${escapeHtml(lead.dealership_name || "Awaiting Admin assignment")}
</td>

<td>
<strong>
R${Number(lead.commission_amount || 0).toFixed(2)}
</strong>
<br>
<span class="badge">
${escapeHtml(commissionLabel(lead.commission_status))}
</span>
</td>

</tr>
`).join("")
: `
<tr>
<td colspan="6" class="empty">
You have not submitted any leads yet.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   HUNTER CREATE LEAD
========================================================= */

app.get("/hunter/leads/new", async (c) => {

  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT id
      FROM hunters
      WHERE user_id = ?
        AND active = 1
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text(
      "Your Hunter account is not active.",
      403
    );
  }

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Add Lead</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Add New Lead</h1>

<nav>
<a href="/hunter">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>Submit Customer Lead</h2>

<div class="notice">
Submit genuine customer enquiries. Admin will review the lead before it is assigned to a dealership.
</div>

<form method="POST" action="/hunter/leads">

<div class="form-grid">

<div>

<label>Customer Name</label>

<input
name="customer_name"
required
maxlength="120"
>

</div>

<div>

<label>Customer Phone</label>

<input
name="customer_phone"
required
maxlength="40"
>

</div>

<div>

<label>Vehicle Interest</label>

<input
name="vehicle_interest"
maxlength="120"
placeholder="e.g. VW Polo"
>

</div>

</div>

<br>

<label>Notes</label>

<textarea
name="notes"
maxlength="1000"
placeholder="Customer requirements, budget, preferred vehicle, etc."
></textarea>

<br>

<button class="btn green" type="submit">
Submit Lead
</button>

</form>

</div>

</main>

</body>
</html>
`);

});

app.post("/hunter/leads", async (c) => {

  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT id
      FROM hunters
      WHERE user_id = ?
        AND active = 1
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text("Hunter account inactive.", 403);
  }

  const body = await c.req.parseBody();

  const customerName =
    String(body.customer_name || "").trim();

  const customerPhone =
    String(body.customer_phone || "").trim();

  const vehicleInterest =
    String(body.vehicle_interest || "").trim();

  const notes =
    String(body.notes || "").trim();

  if (!customerName || !customerPhone) {
    return c.text(
      "Customer name and phone are required.",
      400
    );
  }

  const reference = generateLeadReference();

  const result = await c.env.DB
    .prepare(`
      INSERT INTO leads
      (
        lead_reference,
        hunter_id,
        dealership_id,
        customer_name,
        customer_phone,
        vehicle_interest,
        notes,
        status,
        commission_amount,
        approved_at,
        assigned_at,
        commission_status,
        created_at,
        updated_at
      )
      VALUES
      (?, ?, NULL, ?, ?, ?, ?, 'pending', 0, NULL, NULL, 'pending', ?, ?)
    `)
    .bind(
      reference,
      hunter.id,
      customerName,
      customerPhone,
      vehicleInterest,
      notes,
      now(),
      now()
    )
    .run();

  const leadId = result.meta?.last_row_id || null;

  await logActivity(
    c,
    user.user_id,
    "lead_submitted",
    `Hunter submitted ${reference} for Admin review.`,
    leadId
  );

  return redirect(c, "/hunter");
});

/* =========================================================
   DEALERSHIP DASHBOARD
========================================================= */

app.get("/dealership", async (c) => {

  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  /*
    Dealership accounts use the user's email to locate the
    dealership account. This keeps the existing schema intact.
  */

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE active = 1
        AND LOWER(email) = LOWER(?)
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text(
      "No active dealership account is linked to this login.",
      403
    );
  }

  const leads = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        users.name AS hunter_name
      FROM leads
      LEFT JOIN hunters
        ON hunters.id = leads.hunter_id
      LEFT JOIN users
        ON users.id = hunters.user_id
      WHERE leads.dealership_id = ?
      ORDER BY leads.id DESC
    `)
    .bind(dealership.id)
    .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dealership Dashboard</title>
${baseStyles()}
</head>

<body>

<header>

<h1>Sibakane T & O Auto</h1>

<nav>
<a href="/dealership">Dashboard</a>
<a href="/logout">Logout</a>
</nav>

</header>

<main>

<div class="card">

<h2>${escapeHtml(dealership.name)}</h2>

<p>
Dealership Lead Dashboard
</p>

</div>

<div class="card">

<h2>Assigned Leads</h2>

<div class="table-wrap">

<table>

<tr>
<th>Lead</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Current Status</th>
<th>Update</th>
</tr>

${
leads.results.length
? leads.results.map((lead) => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>
${escapeHtml(lead.customer_name)}
<br>
${escapeHtml(lead.customer_phone)}
</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>
<span class="badge">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>

<form method="POST"
action="/dealership/leads/${lead.id}/status">

<select name="status" required>

${[
["contacted","Customer Contacted"],
["interested","Customer Interested"],
["appointment","Appointment Set"],
["test_drive","Test Drive"],
["negotiating","Negotiating"],
["sold","Sold"],
["lost","Lost"],
["cancelled","Cancelled"]
].map(([value,label]) => `
<option
value="${value}"
${lead.status === value ? "selected" : ""}
>
${label}
</option>
`).join("")}

</select>

<br><br>

<button class="btn blue" type="submit">
Update Status
</button>

</form>

</td>

</tr>
`).join("")
: `
<tr>
<td colspan="5" class="empty">
No leads have been assigned to your dealership.
</td>
</tr>
`
}

</table>

</div>

</div>

</main>

</body>
</html>
`);

});

/* =========================================================
   DEALERSHIP UPDATE LEAD STATUS
========================================================= */

app.post("/dealership/leads/:id/status", async (c) => {

  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE active = 1
        AND LOWER(email) = LOWER(?)
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text(
      "Dealership account not found.",
      403
    );
  }

  const id = Number(c.req.param("id"));

  const body = await c.req.parseBody();

  const status = String(body.status || "");

  const allowedStatuses = [
    "contacted",
    "interested",
    "appointment",
    "test_drive",
    "negotiating",
    "sold",
    "lost",
    "cancelled"
  ];

  if (!allowedStatuses.includes(status)) {
    return c.text("Invalid lead status.", 400);
  }

  const lead = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE id = ?
        AND dealership_id = ?
      LIMIT 1
    `)
    .bind(id, dealership.id)
    .first();

  if (!lead) {
    return c.text(
      "Lead not found or not assigned to this dealership.",
      404
    );
  }

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET
        status = ?,
        updated_at = ?
      WHERE id = ?
        AND dealership_id = ?
    `)
    .bind(
      status,
      now(),
      id,
      dealership.id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    "dealership_status_update",
    `${dealership.name} changed ${lead.lead_reference} from ${lead.status} to ${status}.`,
    id
  );

  /*
    IMPORTANT:
    A dealership status change NEVER automatically makes
    commission payable.

    Admin must confirm that dealership has actually paid,
    then Admin changes commission status to Payable.
  */

  return redirect(c, "/dealership");
});

/* =========================================================
   API: CURRENT USER
========================================================= */

app.get("/api/me", async (c) => {

  const user = await getCurrentUser(c);

  if (!user) {
    return c.json(
      { authenticated: false },
      401
    );
  }

  return c.json({
    authenticated: true,
    user: {
      id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", async (c) => {

  try {

    const result = await c.env.DB
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        ORDER BY name
      `)
      .all();

    return c.json({
      status: "healthy",
      database: "connected",
      tables: result.results
    });

  } catch (error) {

    return c.json({
      status: "error",
      message: error.message
    }, 500);

  }

});

/* =========================================================
   SYSTEM STATUS
========================================================= */

app.get("/api/status", (c) => {

  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "4.0.0"
  });

});

export default app;
