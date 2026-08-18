import { Hono } from "hono";

const app = new Hono();

/* =========================
   SECURITY / HELPERS
========================= */

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
      JOIN users ON users.id = sessions.user_id
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

/* =========================
   LOGIN PAGE
========================= */

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
  background:#f4f4f4;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px
}

.login-box{
  width:100%;
  max-width:420px;
  background:white;
  padding:30px;
  border-radius:16px;
  box-shadow:0 10px 35px rgba(0,0,0,.12)
}

.logo{
  text-align:center;
  margin-bottom:25px
}

.logo h1{
  margin:0;
  font-size:25px
}

.logo p{
  margin:8px 0 0;
  color:#777
}

label{
  display:block;
  margin-top:15px;
  font-weight:bold
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
  background:#ffe7e7;
  color:#b00020;
  padding:12px;
  border-radius:8px;
  margin-bottom:15px;
  text-align:center
}

.footer{
  text-align:center;
  margin-top:20px;
  color:#888;
  font-size:13px
}
</style>
</head>

<body>

<div class="login-box">

<div class="logo">
<h1>Sibakane T & O Auto</h1>
<p>Secure Management System</p>
</div>

${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}

<form method="POST" action="/login">

<label>Email</label>

<input
type="email"
name="email"
placeholder="Enter your email"
required
autocomplete="username"
>

<label>Password</label>

<input
type="password"
name="password"
placeholder="Enter your password"
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

/* =========================
   ADMIN DASHBOARD
========================= */

async function getDashboardData(c) {

  const queries = await Promise.all([

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM users")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM users WHERE active = 1")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM hunters")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM hunters WHERE active = 1")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM dealerships")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM dealerships WHERE active = 1")
      .first(),

    c.env.DB
      .prepare("SELECT COUNT(*) AS total FROM leads")
      .first(),

    c.env.DB
      .prepare(`
        SELECT status, COUNT(*) AS total
        FROM leads
        GROUP BY status
        ORDER BY status
      `)
      .all(),

    c.env.DB
      .prepare(`
        SELECT
          leads.id,
          leads.lead_reference,
          leads.customer_name,
          leads.vehicle_interest,
          leads.status,
          leads.created_at,
          dealerships.name AS dealership_name
        FROM leads
        LEFT JOIN dealerships
          ON dealerships.id = leads.dealership_id
        ORDER BY leads.id DESC
        LIMIT 10
      `)
      .all(),

    c.env.DB
      .prepare(`
        SELECT
          activity_log.id,
          activity_log.action,
          activity_log.details,
          activity_log.created_at,
          users.name AS user_name
        FROM activity_log
        LEFT JOIN users
          ON users.id = activity_log.user_id
        ORDER BY activity_log.id DESC
        LIMIT 10
      `)
      .all()
  ]);

  return {
    users: queries[0]?.total || 0,
    activeUsers: queries[1]?.total || 0,
    hunters: queries[2]?.total || 0,
    activeHunters: queries[3]?.total || 0,
    dealerships: queries[4]?.total || 0,
    activeDealerships: queries[5]?.total || 0,
    leads: queries[6]?.total || 0,
    leadStatuses: queries[7]?.results || [],
    recentLeads: queries[8]?.results || [],
    activity: queries[9]?.results || []
  };
}

function adminDashboard(user, data) {

  const statusCards = data.leadStatuses.length
    ? data.leadStatuses.map((item) => `
        <div class="status-card">
          <strong>${escapeHtml(item.status)}</strong>
          <span>${item.total}</span>
        </div>
      `).join("")
    : `
      <div class="empty">
        No leads have been created yet.
      </div>
    `;

  const recentLeads = data.recentLeads.length
    ? data.recentLeads.map((lead) => `
        <tr>
          <td>${escapeHtml(lead.lead_reference)}</td>
          <td>${escapeHtml(lead.customer_name)}</td>
          <td>${escapeHtml(lead.vehicle_interest || "-")}</td>
          <td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>
          <td>
            <span class="badge">
              ${escapeHtml(lead.status)}
            </span>
          </td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="5" class="empty">
          No leads yet.
        </td>
      </tr>
    `;

  const activity = data.activity.length
    ? data.activity.map((item) => `
        <div class="activity">
          <strong>${escapeHtml(item.action)}</strong>
          <div>${escapeHtml(item.details || "")}</div>
          <small>
            ${escapeHtml(item.user_name || "System")}
            ·
            ${escapeHtml(item.created_at)}
          </small>
        </div>
      `).join("")
    : `
      <div class="empty">
        No activity recorded yet.
      </div>
    `;

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Admin Dashboard - Sibakane T & O Auto</title>

<style>

*{
  box-sizing:border-box
}

body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#f5f5f5;
  color:#222
}

header{
  background:#222;
  color:white;
  padding:18px 20px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:15px
}

header h1{
  margin:0;
  font-size:20px
}

.logout{
  color:white;
  text-decoration:none;
  background:#555;
  padding:9px 14px;
  border-radius:7px;
  font-size:14px
}

main{
  max-width:1200px;
  margin:auto;
  padding:25px 18px
}

.welcome{
  background:white;
  padding:22px;
  border-radius:12px;
  margin-bottom:20px;
  box-shadow:0 3px 15px rgba(0,0,0,.06)
}

.welcome h2{
  margin-top:0
}

.grid{
  display:grid;
  grid-template-columns:
  repeat(auto-fit,minmax(180px,1fr));
  gap:15px;
  margin-bottom:25px
}

.card{
  background:white;
  padding:20px;
  border-radius:12px;
  box-shadow:0 3px 15px rgba(0,0,0,.06)
}

.card h3{
  margin:0 0 10px;
  font-size:15px;
  color:#666
}

.number{
  font-size:32px;
  font-weight:bold
}

.sub{
  margin-top:6px;
  color:#777;
  font-size:13px
}

.section{
  background:white;
  padding:20px;
  border-radius:12px;
  margin-bottom:20px;
  box-shadow:0 3px 15px rgba(0,0,0,.06)
}

.section h2{
  margin-top:0
}

.status-grid{
  display:grid;
  grid-template-columns:
  repeat(auto-fit,minmax(130px,1fr));
  gap:10px
}

.status-card{
  padding:15px;
  border:1px solid #eee;
  border-radius:9px;
  display:flex;
  justify-content:space-between;
  gap:10px
}

.status-card span{
  font-weight:bold
}

.table-wrap{
  overflow-x:auto
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:700px
}

th,td{
  text-align:left;
  padding:12px;
  border-bottom:1px solid #eee
}

th{
  background:#fafafa
}

.badge{
  display:inline-block;
  padding:5px 9px;
  border-radius:5px;
  background:#eee;
  font-size:12px;
  font-weight:bold
}

.empty{
  color:#777;
  padding:20px;
  text-align:center
}

.activity{
  padding:13px 0;
  border-bottom:1px solid #eee
}

.activity:last-child{
  border-bottom:0
}

.activity small{
  color:#888
}

.quick-actions{
  display:grid;
  grid-template-columns:
  repeat(auto-fit,minmax(160px,1fr));
  gap:10px
}

.action{
  display:block;
  text-decoration:none;
  background:#222;
  color:white;
  padding:14px;
  border-radius:8px;
  text-align:center;
  font-weight:bold
}

.online{
  color:#16833b;
  font-weight:bold
}

@media(max-width:600px){

  main{
    padding:15px 12px
  }

  header h1{
    font-size:17px
  }

  .welcome{
    padding:18px
  }

  .card{
    padding:17px
  }

}

</style>

</head>

<body>

<header>

<h1>Sibakane T & O Auto</h1>

<a class="logout" href="/logout">
Logout
</a>

</header>

<main>

<div class="welcome">

<h2>Admin Control Centre</h2>

<p>
Welcome,
<strong>${escapeHtml(user.name)}</strong>.
</p>

<p>
${escapeHtml(user.email)}
</p>

<p class="online">
● System Online
</p>

</div>

<!-- MAIN STATISTICS -->

<div class="grid">

<div class="card">
<h3>Total Users</h3>
<div class="number">${data.users}</div>
<div class="sub">
${data.activeUsers} active
</div>
</div>

<div class="card">
<h3>Lead Hunters</h3>
<div class="number">${data.hunters}</div>
<div class="sub">
${data.activeHunters} active
</div>
</div>

<div class="card">
<h3>Dealerships</h3>
<div class="number">${data.dealerships}</div>
<div class="sub">
${data.activeDealerships} active
</div>
</div>

<div class="card">
<h3>Total Leads</h3>
<div class="number">${data.leads}</div>
<div class="sub">
All vehicle leads
</div>
</div>

</div>

<!-- QUICK ACTIONS -->

<div class="section">

<h2>Management</h2>

<div class="quick-actions">

<a class="action" href="/admin/leads">
Lead Control
</a>

<a class="action" href="/admin/hunters">
Lead Hunters
</a>

<a class="action" href="/admin/dealerships">
Dealerships
</a>

<a class="action" href="/admin/users">
Users
</a>

</div>

</div>

<!-- LEAD STATUS -->

<div class="section">

<h2>Lead Status</h2>

<div class="status-grid">

${statusCards}

</div>

</div>

<!-- RECENT LEADS -->

<div class="section">

<h2>Recent Leads</h2>

<div class="table-wrap">

<table>

<thead>

<tr>
<th>Reference</th>
<th>Customer</th>
<th>Vehicle</th>
<th>Dealership</th>
<th>Status</th>
</tr>

</thead>

<tbody>

${recentLeads}

</tbody>

</table>

</div>

</div>

<!-- ACTIVITY -->

<div class="section">

<h2>Recent Activity</h2>

${activity}

</div>

</main>

</body>
</html>
`;
}

/* =========================
   HOME
========================= */

app.get("/", async (c) => {

  const user = await getCurrentUser(c);

  if (!user) {
    return c.html(loginPage());
  }

  if (user.role === "admin") {

    try {

      const data = await getDashboardData(c);

      return c.html(
        adminDashboard(user, data)
      );

    } catch (error) {

      return c.html(`
        <h1>Dashboard Error</h1>
        <p>${escapeHtml(error.message)}</p>
        <a href="/logout">Logout</a>
      `, 500);

    }
  }

  return c.html(`
    <h1>Sibakane T & O Auto</h1>
    <p>Welcome ${escapeHtml(user.name)}</p>
    <p>Role: ${escapeHtml(user.role)}</p>
    <a href="/logout">Logout</a>
  `);
});

/* =========================
   LOGIN
========================= */

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

    const passwordHash =
      await hashPassword(password);

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

    const sessionId =
      crypto.randomUUID();

    const expiresAt =
      new Date(
        Date.now() +
        7 * 24 * 60 * 60 * 1000
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

    await c.env.DB
      .prepare(`
        INSERT INTO activity_log
        (user_id,action,details)
        VALUES (?,?,?)
      `)
      .bind(
        user.id,
        "login",
        "User logged into the system"
      )
      .run();

    c.header(
      "Set-Cookie",
      `session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );

    return c.redirect("/");

  } catch (error) {

    return c.html(
      loginPage("Login system error."),
      500
    );

  }

});

/* =========================
   LOGOUT
========================= */

app.get("/logout", async (c) => {

  try {

    const sessionId =
      getSessionId(c);

    const user =
      await getCurrentUser(c);

    if (sessionId) {

      await c.env.DB
        .prepare(
          "DELETE FROM sessions WHERE id = ?"
        )
        .bind(sessionId)
        .run();

    }

    if (user) {

      await c.env.DB
        .prepare(`
          INSERT INTO activity_log
          (user_id,action,details)
          VALUES (?,?,?)
        `)
        .bind(
          user.user_id,
          "logout",
          "User logged out"
        )
        .run();

    }

    c.header(
      "Set-Cookie",
      "session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );

    return c.redirect("/");

  } catch (error) {

    return c.redirect("/");

  }

});

/* =========================
   ADMIN ROUTE
========================= */

app.get("/admin", async (c) => {

  const user =
    await getCurrentUser(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user.role !== "admin") {
    return c.text("Forbidden", 403);
  }

  const data =
    await getDashboardData(c);

  return c.html(
    adminDashboard(user, data)
  );

});

/* =========================
   ADMIN PLACEHOLDER MODULES
========================= */

async function requireAdmin(c) {

  const user =
    await getCurrentUser(c);

  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    return false;
  }

  return user;
}

app.get("/admin/leads", async (c) => {

  const user =
    await requireAdmin(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user === false) {
    return c.text("Forbidden", 403);
  }

  const leads =
    await c.env.DB
      .prepare(`
        SELECT
          leads.*,
          dealerships.name AS dealership_name
        FROM leads
        LEFT JOIN dealerships
          ON dealerships.id = leads.dealership_id
        ORDER BY leads.id DESC
      `)
      .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Lead Control</title>

<style>
body{
font-family:Arial;
margin:0;
background:#f5f5f5
}

header{
background:#222;
color:white;
padding:18px
}

main{
padding:20px;
max-width:1200px;
margin:auto
}

.box{
background:white;
padding:20px;
border-radius:12px
}

a{
color:#222
}

table{
width:100%;
border-collapse:collapse;
min-width:800px
}

th,td{
padding:12px;
border-bottom:1px solid #ddd;
text-align:left
}

.wrap{
overflow:auto
}

.empty{
padding:30px;
text-align:center;
color:#777
}
</style>

</head>

<body>

<header>
<strong>Sibakane T & O Auto</strong>
</header>

<main>

<p>
<a href="/">← Back to Dashboard</a>
</p>

<div class="box">

<h2>Lead Control</h2>

<div class="wrap">

<table>

<tr>
<th>Reference</th>
<th>Customer</th>
<th>Phone</th>
<th>Vehicle</th>
<th>Dealership</th>
<th>Status</th>
</tr>

${
  leads.results.length
    ? leads.results.map((lead) => `
<tr>
<td>${escapeHtml(lead.lead_reference)}</td>
<td>${escapeHtml(lead.customer_name)}</td>
<td>${escapeHtml(lead.customer_phone)}</td>
<td>${escapeHtml(lead.vehicle_interest || "-")}</td>
<td>${escapeHtml(lead.dealership_name || "Unassigned")}</td>
<td>${escapeHtml(lead.status)}</td>
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

</main>

</body>
</html>
`);

});

/* =========================
   HUNTERS
========================= */

app.get("/admin/hunters", async (c) => {

  const user =
    await requireAdmin(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user === false) {
    return c.text("Forbidden", 403);
  }

  const hunters =
    await c.env.DB
      .prepare(`
        SELECT
          hunters.id,
          hunters.phone,
          hunters.active,
          hunters.created_at,
          users.name,
          users.email
        FROM hunters
        JOIN users
          ON users.id = hunters.user_id
        ORDER BY hunters.id DESC
      `)
      .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Lead Hunters</title>

<style>
body{
font-family:Arial;
margin:0;
background:#f5f5f5
}

header{
background:#222;
color:white;
padding:18px
}

main{
padding:20px;
max-width:1000px;
margin:auto
}

.box{
background:white;
padding:20px;
border-radius:12px
}

table{
width:100%;
border-collapse:collapse
}

th,td{
padding:12px;
border-bottom:1px solid #ddd;
text-align:left
}

.empty{
text-align:center;
padding:30px;
color:#777
}
</style>

</head>

<body>

<header>
<strong>Sibakane T & O Auto</strong>
</header>

<main>

<p>
<a href="/">← Back to Dashboard</a>
</p>

<div class="box">

<h2>Lead Hunters</h2>

<table>

<tr>
<th>Name</th>
<th>Email</th>
<th>Phone</th>
<th>Status</th>
</tr>

${
  hunters.results.length
    ? hunters.results.map((hunter) => `
<tr>
<td>${escapeHtml(hunter.name)}</td>
<td>${escapeHtml(hunter.email)}</td>
<td>${escapeHtml(hunter.phone || "-")}</td>
<td>${hunter.active ? "Active" : "Inactive"}</td>
</tr>
`).join("")
    : `
<tr>
<td colspan="4" class="empty">
No lead hunters registered yet.
</td>
</tr>
`
}

</table>

</div>

</main>

</body>
</html>
`);

});

/* =========================
   DEALERSHIPS
========================= */

app.get("/admin/dealerships", async (c) => {

  const user =
    await requireAdmin(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user === false) {
    return c.text("Forbidden", 403);
  }

  const dealerships =
    await c.env.DB
      .prepare(`
        SELECT *
        FROM dealerships
        ORDER BY id DESC
      `)
      .all();

  return c.html(`
<!DOCTYPE html>
<html>
<head>

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Dealerships</title>

<style>
body{
font-family:Arial;
margin:0;
background:#f5f5f5
}

header{
background:#222;
color:white;
padding:18px
}

main{
padding:20px;
max-width:1000px;
margin:auto
}

.box{
background:white;
padding:20px;
border-radius:12px
}

table{
width:100%;
border-collapse:collapse
}

th,td{
padding:12px;
border-bottom:1px solid #ddd;
text-align:left
}

.empty{
text-align:center;
padding:30px;
color:#777
}
</style>

</head>

<body>

<header>
<strong>Sibakane T & O Auto</strong>
</header>

<main>

<p>
<a href="/">← Back to Dashboard</a>
</p>

<div class="box">

<h2>Dealerships</h2>

<table>

<tr>
<th>Dealership</th>
<th>Contact</th>
<th>Email</th>
<th>Phone</th>
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
<td>${dealer.active ? "Active" : "Inactive"}</td>
</tr>
`).join("")
    : `
<tr>
<td colspan="5" class="empty">
No dealerships registered yet.
</td>
</tr>
`
}

</table>

</div>

</main>

</body>
</html>
`);

});

/* =========================
   USERS
========================= */

app.get("/admin/users", async (c) => {

  const user =
    await requireAdmin(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user === false) {
    return c.text("Forbidden", 403);
  }

  const users =
    await c.env.DB
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

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Users</title>

<style>
body{
font-family:Arial;
margin:0;
background:#f5f5f5
}

header{
background:#222;
color:white;
padding:18px
}

main{
padding:20px;
max-width:1000px;
margin:auto
}

.box{
background:white;
padding:20px;
border-radius:12px
}

table{
width:100%;
border-collapse:collapse
}

th,td{
padding:12px;
border-bottom:1px solid #ddd;
text-align:left
}

.empty{
text-align:center;
padding:30px;
color:#777
}
</style>

</head>

<body>

<header>
<strong>Sibakane T & O Auto</strong>
</header>

<main>

<p>
<a href="/">← Back to Dashboard</a>
</p>

<div class="box">

<h2>Users</h2>

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
<td>${escapeHtml(account.role)}</td>
<td>${account.active ? "Active" : "Inactive"}</td>
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

</main>

</body>
</html>
`);

});

/* =========================
   CURRENT USER API
========================= */

app.get("/api/me", async (c) => {

  const user =
    await getCurrentUser(c);

  if (!user) {

    return c.json({
      authenticated: false
    }, 401);

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

/* =========================
   HEALTH
========================= */

app.get("/health", async (c) => {

  try {

    const result =
      await c.env.DB
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

/* =========================
   API STATUS
========================= */

app.get("/api/status", (c) => {

  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "3.1.0"
  });

});

export default app;
