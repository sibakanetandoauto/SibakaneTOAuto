import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
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
   BASIC HELPERS
   ========================================================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(String(password));
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
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

function redirect(c, path) {
  return c.redirect(path, 302);
}

function money(value) {
  return `R${Number(value || 0).toFixed(2)}`;
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
    qualified: "Qualified",
    interested: "Customer Interested",
    appointment: "Appointment Set",
    test_drive: "Test Drive",
    negotiating: "Negotiating",
    sold: "Sold",
    lost: "Lost",
    cancelled: "Cancelled"
  };

  return labels[status] || String(status || "");
}

function commissionLabel(status) {
  return {
    pending: "Pending",
    payable: "Payable",
    paid: "Paid"
  }[status] || String(status || "");
}

function statusClass(status) {
  if (["sold", "payable", "paid", "approved"].includes(status))
    return "success";

  if (["pending", "assigned", "contacted", "interested", "appointment", "test_drive", "negotiating"].includes(status))
    return "warning";

  if (["declined", "lost", "cancelled"].includes(status))
    return "danger";

  return "info";
}

/* =========================================================
   D1 HELPERS
   ========================================================= */

async function tableColumns(db, table) {
  const result = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  return new Set(
    (result.results || []).map(row => row.name)
  );
}

async function insertFlexible(db, table, data) {
  const columns = await tableColumns(db, table);

  const usable = Object.entries(data)
    .filter(([key, value]) =>
      columns.has(key) &&
      value !== undefined
    );

  if (!usable.length) return null;

  const names = usable.map(([key]) => key);
  const values = usable.map(([, value]) => value);
  const marks = names.map(() => "?").join(",");

  return db
    .prepare(
      `INSERT INTO ${table} (${names.join(",")})
       VALUES (${marks})`
    )
    .bind(...values)
    .run();
}

async function updateFlexible(db, table, data, where, whereValues) {
  const columns = await tableColumns(db, table);

  const usable = Object.entries(data)
    .filter(([key, value]) =>
      columns.has(key) &&
      value !== undefined
    );

  if (!usable.length) return null;

  const set = usable
    .map(([key]) => `${key} = ?`)
    .join(",");

  return db
    .prepare(
      `UPDATE ${table}
       SET ${set}
       WHERE ${where}`
    )
    .bind(
      ...usable.map(([, value]) => value),
      ...whereValues
    )
    .run();
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
      INNER JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.id = ?
      LIMIT 1
    `)
    .bind(sessionId)
    .first();

  if (!session) return null;

  if (!session.active) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();

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

async function logActivity(c, userId, action, details = "", leadId = null) {
  try {
    await insertFlexible(c.env.DB, "activity_log", {
      user_id: userId,
      lead_id: leadId,
      action,
      details,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.log("Activity log error:", e);
  }
}

/* =========================================================
   SHARED CSS
   ========================================================= */

function styles() {
  return `
<style>
:root{
--purple:${BRAND.purple};
--purple-dark:${BRAND.purpleDark};
--purple-light:${BRAND.purpleLight};
--gold:${BRAND.gold};
--gold-dark:${BRAND.goldDark};
--white:#fff;
--dark:${BRAND.charcoal};
--light:${BRAND.light};
--border:#e7deeb;
}

*{box-sizing:border-box}

body{
margin:0;
font-family:Arial,Helvetica,sans-serif;
background:var(--light);
color:var(--dark);
}

.site-header{
background:linear-gradient(135deg,var(--purple-dark),var(--purple));
border-bottom:5px solid var(--gold);
color:white;
box-shadow:0 5px 20px rgba(0,0,0,.18);
}

.header-inner{
max-width:1350px;
margin:auto;
padding:15px;
display:flex;
align-items:center;
justify-content:space-between;
gap:15px;
}

.brand{
display:flex;
align-items:center;
gap:12px;
}

.brand-mark{
width:50px;
height:50px;
border-radius:12px;
background:var(--gold);
color:var(--purple-dark);
display:flex;
align-items:center;
justify-content:center;
font-weight:900;
font-size:22px;
}

.brand-name{
font-size:20px;
font-weight:900;
}

.brand-tagline{
font-size:11px;
opacity:.9;
margin-top:4px;
}

nav{
display:flex;
gap:6px;
flex-wrap:wrap;
justify-content:flex-end;
}

nav a{
color:white;
text-decoration:none;
padding:9px 11px;
border-radius:8px;
background:rgba(255,255,255,.12);
font-size:12px;
font-weight:800;
}

nav a:hover{
background:var(--gold);
color:var(--purple-dark);
}

main{
max-width:1350px;
margin:auto;
padding:20px 15px 45px;
}

.card{
background:white;
border:1px solid var(--border);
border-radius:15px;
padding:20px;
margin-bottom:18px;
box-shadow:0 4px 18px rgba(50,16,75,.06);
}

h1,h2,h3{
color:var(--purple-dark);
}

.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
gap:15px;
}

.stat{
background:white;
border:1px solid var(--border);
border-top:5px solid var(--gold);
border-radius:13px;
padding:17px;
}

.stat h3{
margin:0;
font-size:12px;
color:#777;
}

.stat strong{
display:block;
font-size:27px;
color:var(--purple);
margin-top:8px;
}

.table-wrap{
overflow-x:auto;
}

table{
width:100%;
min-width:850px;
border-collapse:collapse;
}

th,td{
padding:11px;
border-bottom:1px solid #eee;
text-align:left;
vertical-align:top;
}

th{
background:var(--purple-dark);
color:white;
font-size:12px;
}

.form-grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
gap:15px;
}

label{
display:block;
font-size:13px;
font-weight:800;
color:var(--purple-dark);
margin-bottom:6px;
}

input,select,textarea{
width:100%;
padding:11px;
border:1px solid #ccc;
border-radius:8px;
font:inherit;
background:white;
}

textarea{
min-height:100px;
resize:vertical;
}

input:focus,select:focus,textarea:focus{
outline:3px solid rgba(244,196,48,.25);
border-color:var(--purple);
}

.btn{
display:inline-block;
padding:10px 14px;
border:0;
border-radius:8px;
background:var(--purple);
color:white;
text-decoration:none;
font-weight:800;
font-size:12px;
cursor:pointer;
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
}

.btn.red{
background:#c62828;
}

.btn.blue{
background:#1565c0;
}

.btn.gray{
background:#666;
}

.actions{
display:flex;
flex-wrap:wrap;
gap:7px;
}

.badge{
display:inline-block;
padding:5px 9px;
border-radius:20px;
font-size:11px;
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

.notice{
background:#f3ebf7;
border-left:5px solid var(--gold);
padding:14px;
border-radius:8px;
margin-bottom:15px;
}

.amount{
font-weight:900;
color:var(--purple);
}

.empty{
padding:30px;
text-align:center;
color:#777;
}

.footer{
text-align:center;
padding:25px;
font-size:12px;
color:#777;
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

main{
padding:12px 8px 30px;
}

.card{
padding:15px;
}

.brand-name{
font-size:17px;
}

.brand-tagline{
font-size:10px;
}
}
</style>
`;
}

/* =========================================================
   PAGE WRAPPER
   ========================================================= */

function page(title, body, links = []) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(BRAND.name)} — ${escapeHtml(title)}</title>
${styles()}
</head>
<body>

<header class="site-header">
<div class="header-inner">

<div class="brand">
<div class="brand-mark">S</div>
<div>
<div class="brand-name">${escapeHtml(BRAND.name)}</div>
<div class="brand-tagline">${escapeHtml(BRAND.tagline)}</div>
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

<main>
${body}
</main>

<div class="footer">
<strong>${escapeHtml(BRAND.name)}</strong><br>
${escapeHtml(BRAND.tagline)}
</div>

</body>
</html>
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
${styles()}

<style>
body{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
padding:20px;
background:linear-gradient(135deg,#32104B,#4B176D,#6F2A91);
}

.login{
width:100%;
max-width:430px;
}

.login-brand{
text-align:center;
color:white;
margin-bottom:20px;
}

.login-mark{
width:85px;
height:85px;
border-radius:22px;
background:var(--gold);
color:var(--purple-dark);
display:flex;
align-items:center;
justify-content:center;
font-size:40px;
font-weight:900;
margin:auto auto 15px;
}

.login-box{
background:white;
border-top:6px solid var(--gold);
border-radius:18px;
padding:28px;
box-shadow:0 20px 50px rgba(0,0,0,.25);
}

.login-button{
width:100%;
padding:14px;
border:0;
border-radius:9px;
background:var(--purple);
color:white;
font-weight:900;
font-size:15px;
cursor:pointer;
}

.error{
background:#ffe0e0;
color:#a00000;
padding:12px;
border-radius:8px;
margin-bottom:15px;
font-size:13px;
}
</style>
</head>

<body>

<div class="login">

<div class="login-brand">
<div class="login-mark">S</div>
<h1>${escapeHtml(BRAND.name)}</h1>
<p>${escapeHtml(BRAND.tagline)}</p>
</div>

<div class="login-box">

<h2>Secure Login</h2>

${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}

<form method="POST" action="/login">

<label>Email</label>
<input
name="email"
type="email"
autocomplete="username"
required
>

<br><br>

<label>Password</label>
<input
name="password"
type="password"
autocomplete="current-password"
required
>

<br><br>

<button class="login-button" type="submit">
Login
</button>

</form>

</div>
</div>

</body>
</html>
`;
}

/* =========================================================
   ROOT
========================================================= */

app.get("/", async c => {
  const user = await getCurrentUser(c);

  if (!user) return c.html(loginPage());

  if (user.role === "admin") return redirect(c, "/admin");
  if (user.role === "hunter") return redirect(c, "/hunter");
  if (user.role === "dealership") return redirect(c, "/dealership");

  return c.text("Unauthorized role.", 403);
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/login", async c => {
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

    const user = await c.env.DB
      .prepare(`
        SELECT id,name,email,password_hash,role,active
        FROM users
        WHERE LOWER(email)=?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (!user || !user.active) {
      return c.html(loginPage("Invalid email or password."), 401);
    }

    const hash = await hashPassword(password);

    if (hash !== user.password_hash) {
      return c.html(loginPage("Invalid email or password."), 401);
    }

    const sessionId = crypto.randomUUID();

    const expires = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await insertFlexible(c.env.DB, "sessions", {
      id: sessionId,
      user_id: user.id,
      expires_at: expires,
      created_at: new Date().toISOString()
    });

    await logActivity(
      c,
      user.id,
      "login",
      "Successful login"
    );

    c.header(
      "Set-Cookie",
      `session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );

    return redirect(c, "/");

  } catch (error) {
    console.log(error);
    return c.html(
      loginPage("Login system error."),
      500
    );
  }
});

/* =========================================================
   LOGOUT
========================================================= */

app.get("/logout", async c => {
  const sessionId = getSessionId(c);
  const user = await getCurrentUser(c);

  if (sessionId) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id=?")
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

app.get("/admin", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const [
    users,
    hunters,
    dealerships,
    leads,
    payable,
    paid,
    recent
  ] = await Promise.all([

    c.env.DB.prepare(
      "SELECT COUNT(*) total FROM users"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) total FROM hunters WHERE active=1"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) total FROM dealerships WHERE active=1"
    ).first(),

    c.env.DB.prepare(
      "SELECT COUNT(*) total FROM leads"
    ).first(),

    c.env.DB.prepare(`
      SELECT COALESCE(SUM(commission_amount),0) total
      FROM leads
      WHERE commission_status='payable'
    `).first(),

    c.env.DB.prepare(`
      SELECT COALESCE(SUM(commission_amount),0) total
      FROM leads
      WHERE commission_status='paid'
    `).first(),

    c.env.DB.prepare(`
      SELECT
        leads.*,
        dealerships.name dealership_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id=leads.dealership_id
      ORDER BY leads.id DESC
      LIMIT 10
    `).all()
  ]);

  const body = `
<div class="card">
<div class="notice">
<strong>Admin Control Centre</strong><br>
Welcome, ${escapeHtml(user.name)}.
</div>

<h1>Dashboard</h1>

<div class="grid">

<div class="stat">
<h3>Total Users</h3>
<strong>${users?.total || 0}</strong>
</div>

<div class="stat">
<h3>Active Hunters</h3>
<strong>${hunters?.total || 0}</strong>
</div>

<div class="stat">
<h3>Active Dealerships</h3>
<strong>${dealerships?.total || 0}</strong>
</div>

<div class="stat">
<h3>Total Leads</h3>
<strong>${leads?.total || 0}</strong>
</div>

<div class="stat">
<h3>Payable Commission</h3>
<strong>${money(payable?.total)}</strong>
</div>

<div class="stat">
<h3>Paid Commission</h3>
<strong>${money(paid?.total)}</strong>
</div>

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
(recent?.results || []).map(lead => `
<tr>
<td>
<a href="/admin/leads/${encodeURIComponent(lead.id)}">
${escapeHtml(lead.lead_reference)}
</a>
</td>

<td>${escapeHtml(lead.customer_name)}</td>

<td>${escapeHtml(lead.vehicle_interest || "-")}</td>

<td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>

<td>
<span class="badge ${statusClass(lead.status)}">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>
${money(lead.commission_amount)}
<br>
<span class="badge ${statusClass(lead.commission_status)}">
${escapeHtml(commissionLabel(lead.commission_status))}
</span>
</td>

</tr>
`).join("") || `
<tr>
<td colspan="6" class="empty">No leads yet.</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Admin Dashboard",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/hunters", "Lead Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/admin/users", "Users"],
        ["/admin/activity", "Activity"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADMIN LEADS
========================================================= */

app.get("/admin/leads", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const leads = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name dealership_name,
        users.name hunter_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id=leads.dealership_id
      LEFT JOIN users
        ON users.id=leads.hunter_id
      ORDER BY leads.id DESC
    `)
    .all();

  const dealerships = await c.env.DB
    .prepare(`
      SELECT id,name,email,active
      FROM dealerships
      ORDER BY name
    `)
    .all();

  const body = `
<div class="card">
<h1>Lead Control Centre</h1>

<div class="notice">
Admin controls the complete lead lifecycle.
Hunters submit leads. Admin reviews and assigns them.
Dealerships only see leads assigned to them.
</div>
</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Lead</th>
<th>Customer</th>
<th>Hunter</th>
<th>Vehicle</th>
<th>Status</th>
<th>Dealership</th>
<th>Commission</th>
<th>Action</th>
</tr>

${
(leads.results || []).map(lead => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>
<strong>${escapeHtml(lead.customer_name)}</strong><br>
${escapeHtml(lead.customer_phone || "")}
</td>

<td>${escapeHtml(lead.hunter_name || "—")}</td>

<td>${escapeHtml(lead.vehicle_interest || "—")}</td>

<td>
<span class="badge ${statusClass(lead.status)}">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>
${escapeHtml(lead.dealership_name || "Unassigned")}

${
!lead.dealership_id && lead.status !== "declined"
? `
<form method="POST" action="/admin/leads/${lead.id}/assign">
<select name="dealership_id" required>
<option value="">Assign dealership</option>
${
(dealerships.results || [])
.map(d => `
<option value="${d.id}">
${escapeHtml(d.name)}
</option>
`).join("")
}
</select>
<br><br>
<button class="btn blue" type="submit">
Assign
</button>
</form>
`
: ""
}

</td>

<td>
${money(lead.commission_amount)}
<br>
<span class="badge ${statusClass(lead.commission_status)}">
${escapeHtml(commissionLabel(lead.commission_status))}
</span>
</td>

<td>

<div class="actions">

<a class="btn" href="/admin/leads/${lead.id}">
View
</a>

${
lead.status === "pending" || lead.status === "new"
? `
<form method="POST" action="/admin/leads/${lead.id}/approve">
<button class="btn green" type="submit">
Approve
</button>
</form>

<form method="POST" action="/admin/leads/${lead.id}/decline">
<button class="btn red" type="submit">
Decline
</button>
</form>
`
: ""
}

${
lead.commission_status === "pending" && lead.status === "sold"
? `
<form method="POST" action="/admin/leads/${lead.id}/payable">
<button class="btn gold" type="submit">
Make Payable
</button>
</form>
`
: ""
}

${
lead.commission_status === "payable"
? `
<form method="POST" action="/admin/leads/${lead.id}/paid">
<button class="btn green" type="submit">
Mark Paid
</button>
</form>
`
: ""
}

</div>

</td>

</tr>
`).join("") || `
<tr>
<td colspan="8" class="empty">No leads found.</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Lead Control Centre",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADMIN LEAD VIEW
========================================================= */

app.get("/admin/leads/:id", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  const lead = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name dealership_name,
        dealerships.email dealership_email,
        users.name hunter_name,
        users.email hunter_email
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id=leads.dealership_id
      LEFT JOIN users
        ON users.id=leads.hunter_id
      WHERE leads.id=?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.text("Lead not found.", 404);
  }

  const body = `
<div class="card">

<h1>Lead Details</h1>

<div class="grid">

<div>
<strong>Reference</strong>
<p>${escapeHtml(lead.lead_reference)}</p>
</div>

<div>
<strong>Customer</strong>
<p>${escapeHtml(lead.customer_name)}</p>
</div>

<div>
<strong>Phone</strong>
<p>${escapeHtml(lead.customer_phone || "—")}</p>
</div>

<div>
<strong>Vehicle</strong>
<p>${escapeHtml(lead.vehicle_interest || "—")}</p>
</div>

<div>
<strong>Vehicle Type</strong>
<p>${escapeHtml(lead.vehicle_type || "—")}</p>
</div>

<div>
<strong>Status</strong>
<p>
<span class="badge ${statusClass(lead.status)}">
${escapeHtml(statusLabel(lead.status))}
</span>
</p>
</div>

<div>
<strong>Hunter</strong>
<p>${escapeHtml(lead.hunter_name || "—")}</p>
</div>

<div>
<strong>Dealership</strong>
<p>${escapeHtml(lead.dealership_name || "Unassigned")}</p>
</div>

<div>
<strong>Commission</strong>
<p class="amount">${money(lead.commission_amount)}</p>
</div>

<div>
<strong>Commission Status</strong>
<p>
<span class="badge ${statusClass(lead.commission_status)}">
${escapeHtml(commissionLabel(lead.commission_status))}
</span>
</p>
</div>

</div>

${
lead.notes
? `
<hr>
<h3>Notes</h3>
<p>${escapeHtml(lead.notes)}</p>
`
: ""
}

</div>
`;

  return c.html(
    page(
      "Lead Details",
      body,
      [
        ["/admin/leads", "Back to Leads"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   APPROVE LEAD
========================================================= */

app.post("/admin/leads/:id/approve", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      status: "approved"
    },
    "id=?",
    [id]
  );

  await logActivity(
    c,
    user.user_id,
    "lead_approved",
    "Lead approved by admin",
    id
  );

  return redirect(c, "/admin/leads");
});

/* =========================================================
   DECLINE LEAD
========================================================= */

app.post("/admin/leads/:id/decline", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      status: "declined"
    },
    "id=?",
    [id]
  );

  await logActivity(
    c,
    user.user_id,
    "lead_declined",
    "Lead declined by admin",
    id
  );

  return redirect(c, "/admin/leads");
});

/* =========================================================
   ASSIGN DEALERSHIP
========================================================= */

app.post("/admin/leads/:id/assign", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();

  const dealershipId = String(
    body.dealership_id || ""
  );

  if (!dealershipId) {
    return redirect(c, "/admin/leads");
  }

  const dealership = await c.env.DB
    .prepare(`
      SELECT id,name
      FROM dealerships
      WHERE id=? AND active=1
      LIMIT 1
    `)
    .bind(dealershipId)
    .first();

  if (!dealership) {
    return c.text("Invalid dealership.", 400);
  }

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      dealership_id: dealership.id,
      status: "assigned"
    },
    "id=?",
    [id]
  );

  await logActivity(
    c,
    user.user_id,
    "lead_assigned",
    `Assigned to ${dealership.name}`,
    id
  );

  return redirect(c, "/admin/leads");
});

/* =========================================================
   COMMISSION PAYABLE
========================================================= */

app.post("/admin/leads/:id/payable", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  const lead = await c.env.DB
    .prepare(`
      SELECT id,status,commission_status
      FROM leads
      WHERE id=?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) return c.text("Lead not found.", 404);

  if (
    lead.status !== "sold" ||
    lead.commission_status !== "pending"
  ) {
    return c.text(
      "Commission cannot be made payable yet.",
      400
    );
  }

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      commission_status: "payable"
    },
    "id=?",
    [id]
  );

  await logActivity(
    c,
    user.user_id,
    "commission_payable",
    "Commission marked payable",
    id
  );

  return redirect(c, "/admin/leads");
});

/* =========================================================
   COMMISSION PAID
========================================================= */

app.post("/admin/leads/:id/paid", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  const lead = await c.env.DB
    .prepare(`
      SELECT id,commission_status
      FROM leads
      WHERE id=?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) return c.text("Lead not found.", 404);

  if (lead.commission_status !== "payable") {
    return c.text(
      "Commission must be payable before it can be paid.",
      400
    );
  }

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      commission_status: "paid"
    },
    "id=?",
    [id]
  );

  await logActivity(
    c,
    user.user_id,
    "commission_paid",
    "Commission marked paid",
    id
  );

  return redirect(c, "/admin/leads");
});

/* =========================================================
   ADMIN HUNTERS
========================================================= */

app.get("/admin/hunters", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const hunters = await c.env.DB
    .prepare(`
      SELECT
        hunters.*,
        users.name,
        users.email,
        users.active user_active
      FROM hunters
      LEFT JOIN users
        ON users.id=hunters.user_id
      ORDER BY hunters.id DESC
    `)
    .all();

  const body = `
<div class="card">

<h1>Lead Hunters</h1>

<div class="notice">
<strong>Important:</strong>
Hunters are created manually by Admin.
There is no public Hunter recruitment or signup page.
</div>

<a class="btn gold" href="/admin/hunters/new">
+ Add Hunter
</a>

</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Name</th>
<th>Email</th>
<th>Phone</th>
<th>Area</th>
<th>Status</th>
<th>Action</th>
</tr>

${
(hunters.results || []).map(h => `
<tr>

<td>${escapeHtml(h.name || h.full_name || "—")}</td>

<td>${escapeHtml(h.email || "—")}</td>

<td>${escapeHtml(h.phone || "—")}</td>

<td>${escapeHtml(h.area || "—")}</td>

<td>
<span class="badge ${
h.active || h.user_active
? "success"
: "danger"
}">
${h.active || h.user_active ? "Active" : "Inactive"}
</span>
</td>

<td>
<a class="btn" href="/admin/hunters/${h.id}">
Manage
</a>
</td>

</tr>
`).join("") || `
<tr>
<td colspan="6" class="empty">
No Hunters found.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Lead Hunters",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/dealerships", "Dealerships"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADD HUNTER
========================================================= */

app.get("/admin/hunters/new", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = `
<div class="card">

<h1>Add Lead Hunter</h1>

<div class="notice">
Only Admin can create Hunter accounts.
</div>

<form method="POST" action="/admin/hunters/new">

<div class="form-grid">

<div>
<label>Full Name</label>
<input name="name" required>
</div>

<div>
<label>Phone Number</label>
<input name="phone" required>
</div>

<div>
<label>Email</label>
<input name="email" type="email" required>
</div>

<div>
<label>Area</label>
<input name="area" required>
</div>

<div>
<label>Temporary Password</label>
<input name="password" type="password" required minlength="6">
</div>

<div>
<label>Commission Amount</label>
<input name="commission_amount" type="number" step="0.01" value="500">
</div>

</div>

<br>

<button class="btn gold" type="submit">
Create Hunter
</button>

</form>

</div>
`;

  return c.html(
    page(
      "Add Hunter",
      body,
      [
        ["/admin/hunters", "Back to Hunters"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   CREATE HUNTER
========================================================= */

app.post("/admin/hunters/new", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();

  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const area = String(body.area || "").trim();
  const password = String(body.password || "");
  const commission = Number(body.commission_amount || 500);

  if (
    !name ||
    !phone ||
    !email ||
    !area ||
    password.length < 6
  ) {
    return c.text(
      "All Hunter fields are required and password must be at least 6 characters.",
      400
    );
  }

  const existing = await c.env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email)=?
      LIMIT 1
    `)
    .bind(email)
    .first();

  if (existing) {
    return c.text(
      "A user with this email already exists.",
      409
    );
  }

  const hash = await hashPassword(password);

  const result = await insertFlexible(
    c.env.DB,
    "users",
    {
      name,
      email,
      password_hash: hash,
      role: "hunter",
      active: 1,
      created_at: new Date().toISOString()
    }
  );

  const userId =
    result?.meta?.last_row_id;

  if (!userId) {
    return c.text(
      "Could not create Hunter user.",
      500
    );
  }

  await insertFlexible(
    c.env.DB,
    "hunters",
    {
      user_id: userId,
      full_name: name,
      name,
      phone,
      email,
      area,
      commission_amount: commission,
      active: 1,
      created_at: new Date().toISOString()
    }
  );

  await logActivity(
    c,
    user.user_id,
    "hunter_created",
    `Created Hunter ${name}`
  );

  return redirect(c, "/admin/hunters");
});

/* =========================================================
   DEALERSHIPS
========================================================= */

app.get("/admin/dealerships", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const dealerships = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      ORDER BY id DESC
    `)
    .all();

  const body = `
<div class="card">

<h1>Dealerships</h1>

<a class="btn gold" href="/admin/dealerships/new">
+ Add Dealership
</a>

</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Name</th>
<th>Email</th>
<th>Phone</th>
<th>Status</th>
<th>Action</th>
</tr>

${
(dealerships.results || []).map(d => `
<tr>

<td>${escapeHtml(d.name)}</td>

<td>${escapeHtml(d.email || "—")}</td>

<td>${escapeHtml(d.phone || "—")}</td>

<td>
<span class="badge ${d.active ? "success" : "danger"}">
${d.active ? "Active" : "Inactive"}
</span>
</td>

<td>
<a class="btn" href="/admin/dealerships/${d.id}">
Manage
</a>
</td>

</tr>
`).join("") || `
<tr>
<td colspan="5" class="empty">
No dealerships found.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Dealerships",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/hunters", "Hunters"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADD DEALERSHIP
========================================================= */

app.get("/admin/dealerships/new", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = `
<div class="card">

<h1>Add Dealership</h1>

<form method="POST" action="/admin/dealerships/new">

<div class="form-grid">

<div>
<label>Dealership Name</label>
<input name="name" required>
</div>

<div>
<label>Email</label>
<input name="email" type="email" required>
</div>

<div>
<label>Phone</label>
<input name="phone">
</div>

<div>
<label>Area</label>
<input name="area">
</div>

<div>
<label>Temporary Password</label>
<input name="password" type="password" required minlength="6">
</div>

</div>

<br>

<button class="btn gold" type="submit">
Create Dealership
</button>

</form>

</div>
`;

  return c.html(
    page(
      "Add Dealership",
      body,
      [
        ["/admin/dealerships", "Back"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   CREATE DEALERSHIP
========================================================= */

app.post("/admin/dealerships/new", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const area = String(body.area || "").trim();
  const password = String(body.password || "");

  if (!name || !email || password.length < 6) {
    return c.text(
      "Name, email and a password of at least 6 characters are required.",
      400
    );
  }

  const existing = await c.env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email)=?
      LIMIT 1
    `)
    .bind(email)
    .first();

  if (existing) {
    return c.text(
      "A user with this email already exists.",
      409
    );
  }

  const hash = await hashPassword(password);

  const userResult = await insertFlexible(
    c.env.DB,
    "users",
    {
      name,
      email,
      password_hash: hash,
      role: "dealership",
      active: 1,
      created_at: new Date().toISOString()
    }
  );

  const userId = userResult?.meta?.last_row_id;

  await insertFlexible(
    c.env.DB,
    "dealerships",
    {
      user_id: userId,
      name,
      email,
      phone,
      area,
      active: 1,
      created_at: new Date().toISOString()
    }
  );

  await logActivity(
    c,
    user.user_id,
    "dealership_created",
    `Created dealership ${name}`
  );

  return redirect(c, "/admin/dealerships");
});

/* =========================================================
   ADMIN USERS
========================================================= */

app.get("/admin/users", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const users = await c.env.DB
    .prepare(`
      SELECT id,name,email,role,active
      FROM users
      ORDER BY id DESC
    `)
    .all();

  const body = `
<div class="card">
<h1>Users</h1>

<div class="notice">
Users are controlled by Admin. Public account registration is disabled.
</div>
</div>

<div class="card">

<div class="table-wrap">

<table>

<tr>
<th>Name</th>
<th>Email</th>
<th>Role</th>
<th>Status</th>
</tr>

${
(users.results || []).map(u => `
<tr>

<td>${escapeHtml(u.name)}</td>

<td>${escapeHtml(u.email)}</td>

<td>
<span class="badge info">
${escapeHtml(u.role)}
</span>
</td>

<td>
<span class="badge ${u.active ? "success" : "danger"}">
${u.active ? "Active" : "Inactive"}
</span>
</td>

</tr>
`).join("") || `
<tr>
<td colspan="4" class="empty">
No users.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Users",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADMIN ACTIVITY
========================================================= */

app.get("/admin/activity", async c => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const logs = await c.env.DB
    .prepare(`
      SELECT
        activity_log.*,
        users.name user_name
      FROM activity_log
      LEFT JOIN users
        ON users.id=activity_log.user_id
      ORDER BY activity_log.id DESC
      LIMIT 200
    `)
    .all();

  const body = `
<div class="card">

<h1>Activity Log</h1>

<div class="table-wrap">

<table>

<tr>
<th>Date</th>
<th>User</th>
<th>Action</th>
<th>Details</th>
<th>Lead</th>
</tr>

${
(logs.results || []).map(log => `
<tr>

<td>${escapeHtml(log.created_at || "—")}</td>

<td>${escapeHtml(log.user_name || "System")}</td>

<td>${escapeHtml(log.action)}</td>

<td>${escapeHtml(log.details || "")}</td>

<td>${escapeHtml(log.lead_id || "—")}</td>

</tr>
`).join("") || `
<tr>
<td colspan="5" class="empty">
No activity.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Activity",
      body,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   HUNTER DASHBOARD
========================================================= */

app.get("/hunter", async c => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const leads = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE hunter_id=?
      ORDER BY id DESC
    `)
    .bind(user.user_id)
    .all();

  const all = leads.results || [];

  const pending = all.filter(
    l => ["pending", "new"].includes(l.status)
  ).length;

  const sold = all.filter(
    l => l.status === "sold"
  ).length;

  const payable = all
    .filter(l => l.commission_status === "payable")
    .reduce(
      (sum,l) => sum + Number(l.commission_amount || 0),
      0
    );

  const paid = all
    .filter(l => l.commission_status === "paid")
    .reduce(
      (sum,l) => sum + Number(l.commission_amount || 0),
      0
    );

  const body = `
<div class="card">

<div class="notice">
Welcome, <strong>${escapeHtml(user.name)}</strong>.
</div>

<h1>Lead Hunter Dashboard</h1>

<p>
You submit buyer leads and track their progress and commission status.
</p>

<a class="btn gold" href="/hunter/leads/new">
+ Submit Buyer Lead
</a>

</div>

<div class="grid">

<div class="stat">
<h3>Total Leads</h3>
<strong>${all.length}</strong>
</div>

<div class="stat">
<h3>Pending</h3>
<strong>${pending}</strong>
</div>

<div class="stat">
<h3>Sold</h3>
<strong>${sold}</strong>
</div>

<div class="stat">
<h3>Payable</h3>
<strong>${money(payable)}</strong>
</div>

<div class="stat">
<h3>Paid</h3>
<strong>${money(paid)}</strong>
</div>

</div>

<div class="card">

<h2>My Leads</h2>

<div class="table-wrap">

<table>

<tr>
<th>Reference</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Status</th>
<th>Commission</th>
</tr>

${
all.map(lead => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>
${escapeHtml(lead.customer_name)}<br>
${escapeHtml(lead.customer_phone || "")}
</td>

<td>${escapeHtml(lead.vehicle_interest || "—")}</td>

<td>
<span class="badge ${statusClass(lead.status)}">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>
${money(lead.commission_amount)}
<br>
<span class="badge ${statusClass(lead.commission_status)}">
${escapeHtml(commissionLabel(lead.commission_status))}
</span>
</td>

</tr>
`).join("") || `
<tr>
<td colspan="5" class="empty">
No leads submitted yet.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Hunter Dashboard",
      body,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads/new", "Submit Buyer"],
        ["/hunter/earnings", "My Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   HUNTER SUBMIT LEAD
========================================================= */

app.get("/hunter/leads/new", async c => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = `
<div class="card">

<h1>Submit Buyer Lead</h1>

<div class="notice">
Submit genuine buyer information. Admin will review the lead before it is assigned to a dealership.
</div>

<form method="POST" action="/hunter/leads/new">

<div class="form-grid">

<div>
<label>Customer Name</label>
<input name="customer_name" required>
</div>

<div>
<label>Customer Phone</label>
<input name="customer_phone" required>
</div>

<div>
<label>Customer Email</label>
<input name="customer_email" type="email">
</div>

<div>
<label>Vehicle Interest</label>
<input name="vehicle_interest" placeholder="e.g. Kiger" required>
</div>

<div>
<label>Vehicle Type</label>
<select name="vehicle_type">
<option value="new">New</option>
<option value="used">Used</option>
<option value="unknown">Not Sure</option>
</select>
</div>

<div>
<label>Customer Area</label>
<input name="customer_area">
</div>

</div>

<br>

<label>Notes</label>
<textarea name="notes"></textarea>

<br>

<button class="btn gold" type="submit">
Submit Lead
</button>

</form>

</div>
`;

  return c.html(
    page(
      "Submit Buyer Lead",
      body,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/earnings", "Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   CREATE LEAD
========================================================= */

app.post("/hunter/leads/new", async c => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();

  const customerName =
    String(body.customer_name || "").trim();

  const customerPhone =
    String(body.customer_phone || "").trim();

  const customerEmail =
    String(body.customer_email || "").trim();

  const vehicleInterest =
    String(body.vehicle_interest || "").trim();

  const vehicleType =
    String(body.vehicle_type || "unknown");

  const customerArea =
    String(body.customer_area || "").trim();

  const notes =
    String(body.notes || "").trim();

  if (
    !customerName ||
    !customerPhone ||
    !vehicleInterest
  ) {
    return c.text(
      "Customer name, phone and vehicle interest are required.",
      400
    );
  }

  const leadReference = generateLeadReference();

  const hunter = await c.env.DB
    .prepare(`
      SELECT *
      FROM hunters
      WHERE user_id=?
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  const commissionAmount =
    Number(hunter?.commission_amount || 500);

  const result = await insertFlexible(
    c.env.DB,
    "leads",
    {
      lead_reference: leadReference,
      hunter_id: user.user_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      customer_area: customerArea,
      vehicle_interest: vehicleInterest,
      vehicle_type: vehicleType,
      notes,
      status: "pending",
      commission_amount: commissionAmount,
      commission_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  );

  const leadId = result?.meta?.last_row_id;

  await logActivity(
    c,
    user.user_id,
    "lead_submitted",
    `Lead ${leadReference} submitted`,
    leadId || null
  );

  return redirect(c, "/hunter");
});

/* =========================================================
   HUNTER EARNINGS
========================================================= */

app.get("/hunter/earnings", async c => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const rows = await c.env.DB
    .prepare(`
      SELECT
        commission_status,
        COUNT(*) total_leads,
        COALESCE(SUM(commission_amount),0) amount
      FROM leads
      WHERE hunter_id=?
      GROUP BY commission_status
    `)
    .bind(user.user_id)
    .all();

  const body = `
<div class="card">

<h1>My Earnings</h1>

<div class="grid">

${
(rows.results || []).map(r => `
<div class="stat">
<h3>${escapeHtml(commissionLabel(r.commission_status))}</h3>
<strong>${money(r.amount)}</strong>
<p>${r.total_leads} lead(s)</p>
</div>
`).join("") || `
<div class="empty">
No commission records yet.
</div>
`}

</div>
</div>
`;

  return c.html(
    page(
      "My Earnings",
      body,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads/new", "Submit Buyer"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP DASHBOARD
========================================================= */

app.get("/dealership", async c => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE LOWER(email)=LOWER(?)
      AND active=1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.html(
      page(
        "Dealership",
        `
<div class="card">
<h1>Dealership Account</h1>
<div class="notice">
Your dealership profile has not been linked yet.
Please contact Admin.
</div>
</div>
`,
        [["/logout", "Logout"]]
      ),
      403
    );
  }

  const leads = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE dealership_id=?
      ORDER BY id DESC
    `)
    .bind(dealership.id)
    .all();

  const rows = leads.results || [];

  const body = `
<div class="card">

<div class="notice">
Welcome, <strong>${escapeHtml(dealership.name)}</strong>.
</div>

<h1>Dealership Lead Dashboard</h1>

<p>
Only leads assigned to your dealership are visible here.
Hunter information is not displayed.
</p>

</div>

<div class="grid">

<div class="stat">
<h3>Assigned Leads</h3>
<strong>${rows.length}</strong>
</div>

<div class="stat">
<h3>Interested</h3>
<strong>${rows.filter(x => x.status === "interested").length}</strong>
</div>

<div class="stat">
<h3>Appointments</h3>
<strong>${rows.filter(x => x.status === "appointment").length}</strong>
</div>

<div class="stat">
<h3>Sold</h3>
<strong>${rows.filter(x => x.status === "sold").length}</strong>
</div>

</div>

<div class="card">

<h2>Assigned Leads</h2>

<div class="table-wrap">

<table>

<tr>
<th>Lead</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Status</th>
<th>Update</th>
</tr>

${
rows.map(lead => `
<tr>

<td>${escapeHtml(lead.lead_reference)}</td>

<td>
${escapeHtml(lead.customer_name)}<br>
${escapeHtml(lead.customer_phone || "")}
</td>

<td>${escapeHtml(lead.vehicle_interest || "—")}</td>

<td>
<span class="badge ${statusClass(lead.status)}">
${escapeHtml(statusLabel(lead.status))}
</span>
</td>

<td>

<form method="POST"
action="/dealership/leads/${lead.id}/status">

<select name="status" required>

<option value="">Update Status</option>

${[
["contacted","Customer Contacted"],
["qualified","Qualified"],
["interested","Customer Interested"],
["appointment","Appointment Set"],
["test_drive","Test Drive"],
["negotiating","Negotiating"],
["sold","Sold"],
["lost","Lost"],
["cancelled","Cancelled"]
].map(([value,label]) => `
<option value="${value}">
${label}
</option>
`).join("")}

</select>

<br><br>

<button class="btn blue" type="submit">
Update
</button>

</form>

</td>

</tr>
`).join("") || `
<tr>
<td colspan="5" class="empty">
No assigned leads.
</td>
</tr>
`}

</table>

</div>
</div>
`;

  return c.html(
    page(
      "Dealership Dashboard",
      body,
      [
        ["/dealership", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP STATUS UPDATE
========================================================= */

app.post("/dealership/leads/:id/status", async c => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.text("Forbidden", 403);

  const id = c.req.param("id");

  const body = await c.req.parseBody();

  const status = String(body.status || "");

  const allowed = [
    "contacted",
    "qualified",
    "interested",
    "appointment",
    "test_drive",
    "negotiating",
    "sold",
    "lost",
    "cancelled"
  ];

  if (!allowed.includes(status)) {
    return c.text("Invalid lead status.", 400);
  }

  const dealership = await c.env.DB
    .prepare(`
      SELECT id
      FROM dealerships
      WHERE LOWER(email)=LOWER(?)
      AND active=1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text("Dealership account not linked.", 403);
  }

  const lead = await c.env.DB
    .prepare(`
      SELECT id,dealership_id
      FROM leads
      WHERE id=?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.text("Lead not found.", 404);
  }

  if (
    String(lead.dealership_id) !==
    String(dealership.id)
  ) {
    return c.text("Forbidden.", 403);
  }

  await updateFlexible(
    c.env.DB,
    "leads",
    {
      status,
      updated_at: new Date().toISOString()
    },
    "id=? AND dealership_id=?",
    [id, dealership.id]
  );

  await logActivity(
    c,
    user.user_id,
    "lead_status_updated",
    `Dealership changed lead status to ${status}`,
    id
  );

  return redirect(c, "/dealership");
});

/* =========================================================
   404
========================================================= */

app.notFound(c => {
  return c.html(
    page(
      "Page Not Found",
      `
<div class="card">
<h1>Page Not Found</h1>

<p>
The page you requested does not exist.
</p>

<a class="btn" href="/">
Return to Login
</a>

</div>
`,
      []
    ),
    404
  );
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.onError((error, c) => {
  console.error("Worker error:", error);

  return c.html(
    page(
      "System Error",
      `
<div class="card">

<h1>System Error</h1>

<div class="notice">
Something went wrong while processing your request.
</div>

<a class="btn" href="/">
Return Home
</a>

</div>
`,
      []
    ),
    500
  );
});

/* =========================================================
   EXPORT
========================================================= */

export default app;
