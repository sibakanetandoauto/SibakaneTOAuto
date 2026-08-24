import { Hono } from "hono";

const app = new Hono();

/* =========================================================
   SIBAKANE T & O AUTO
   Connecting you to your dream car without the hustle
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
   CONSTANTS
   ========================================================= */

const ROLES = ["admin", "hunter", "dealership"];

const LEAD_STATUSES = [
  "new",
  "pending",
  "approved",
  "declined",
  "assigned",
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

const COMMISSION_STATUSES = [
  "pending",
  "payable",
  "paid"
];

/* =========================================================
   HELPERS
   ========================================================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(String(password || ""));
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

  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
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

function money(value) {
  const number = Number(value || 0);

  return `R${number.toFixed(2)}`;
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

  return labels[status] || status || "Unknown";
}

function commissionLabel(status) {
  const labels = {
    pending: "Pending",
    payable: "Payable",
    paid: "Paid"
  };

  return labels[status] || status || "Unknown";
}

function statusClass(status) {
  if (["sold", "payable", "paid"].includes(status)) {
    return "success";
  }

  if (["pending", "appointment", "negotiating"].includes(status)) {
    return "warning";
  }

  if (["declined", "lost", "cancelled"].includes(status)) {
    return "danger";
  }

  return "info";
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function formValue(body, key) {
  return String(body?.[key] ?? "").trim();
}

/* =========================================================
   DATABASE HELPERS
   ========================================================= */

async function logActivity(
  c,
  userId,
  action,
  details = "",
  leadId = null
) {
  try {
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
  } catch (error) {
    console.error("Activity log error:", error);
  }
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function getCurrentUser(c) {
  const sessionId = getSessionId(c);

  if (!sessionId) {
    return null;
  }

  try {
    const session = await c.env.DB
      .prepare(`
        SELECT
          sessions.id AS session_id,
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
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      await c.env.DB
        .prepare(`
          DELETE FROM sessions
          WHERE id = ?
        `)
        .bind(sessionId)
        .run();

      return null;
    }

    return session;
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
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

async function requireAnyRole(c, roles) {
  const user = await getCurrentUser(c);

  if (!user) {
    return null;
  }

  if (!roles.includes(user.role)) {
    return false;
  }

  return user;
}

/* =========================================================
   BRANDING / CSS
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
  --muted:#707070;
  --green:#198754;
  --red:#c62828;
  --blue:#1565c0;
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

.site-header{
  background:linear-gradient(
    135deg,
    var(--purple-dark),
    var(--purple)
  );
  color:white;
  border-bottom:5px solid var(--gold);
  box-shadow:0 5px 20px rgba(50,16,75,.20);
}

.header-inner{
  max-width:1350px;
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
  width:50px;
  height:50px;
  border-radius:13px;
  background:var(--gold);
  color:var(--purple-dark);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:21px;
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
}

.brand-tagline{
  color:white;
  opacity:.94;
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

main{
  width:100%;
  max-width:1350px;
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

.card h3{
  color:var(--purple-dark);
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
  min-width:900px;
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

button,
input[type="submit"]{
  font-family:inherit;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  align-items:center;
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
  background:var(--green);
  color:white;
}

.btn.red{
  background:var(--red);
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
  padding:14px;
  border-radius:9px;
  background:#f3ebf7;
  border-left:5px solid var(--gold);
  margin-bottom:16px;
}

.notice.error{
  background:#ffe5e5;
  border-left-color:#c62828;
  color:#8d0000;
}

.notice.success{
  background:#dff5e7;
  border-left-color:#198754;
  color:#146c2e;
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

.muted{
  color:var(--muted);
}

.small{
  font-size:12px;
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

.two-column{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:18px;
}

hr{
  border:0;
  border-top:1px solid #eee;
  margin:20px 0;
}

@media(max-width:800px){

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
    text-align:center;
  }

  .two-column{
    grid-template-columns:1fr;
  }
}
</style>
`;
}

function brandedHeader(title, links = []) {
  return `
<header class="site-header">
  <div class="header-inner">

    <div class="brand">
      <div class="brand-mark">S</div>

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
        ([href, label]) =>
          `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
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

function page(title, body, links = []) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${escapeHtml(BRAND.name)} — ${escapeHtml(title)}</title>
  ${baseStyles()}
</head>

<body>

${brandedHeader(title, links)}

<main>
${body}
</main>

${footer()}

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
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

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
      margin-top:15px;
    }

    .login-button:hover{
      background:var(--purple-dark);
    }

    .error-box{
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
        ? `<div class="error-box">${escapeHtml(error)}</div>`
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

    const email = formValue(body, "email").toLowerCase();
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

    if (!ROLES.includes(user.role)) {
      return c.html(
        loginPage("This account has an invalid role."),
        403
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
        (id, user_id, expires_at)
        VALUES (?, ?, ?)
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
      [
        `session_id=${encodeURIComponent(sessionId)}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=604800"
      ].join("; ")
    );

    return redirect(c, "/");

  } catch (error) {
    console.error("Login error:", error);

    return c.html(
      loginPage("Login system error. Please try again."),
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
    try {
      await c.env.DB
        .prepare(`
          DELETE FROM sessions
          WHERE id = ?
        `)
        .bind(sessionId)
        .run();
    } catch (error) {
      console.error("Logout session error:", error);
    }
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
    [
      "session_id=",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );

  return redirect(c, "/");
});

/* =========================================================
   ACCESS DENIED
   ========================================================= */

function forbiddenPage() {
  return page(
    "Access Denied",
    `
      <div class="card">
        <div class="section-label">Security</div>

        <h2>Access Denied</h2>

        <p>
          You do not have permission to access this area.
        </p>

        <a class="btn" href="/">
          Return to Dashboard
        </a>
      </div>
    `,
    [["/logout", "Logout"]]
  );
}

/* =========================================================
   ADMIN DASHBOARD DATA
   ========================================================= */

async function getDashboardData(c) {
  const results = await Promise.all([
    c.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM users
      `)
      .first(),

    c.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM hunters
        WHERE active = 1
      `)
      .first(),

    c.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM dealerships
        WHERE active = 1
      `)
      .first(),

    c.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM leads
      `)
      .first(),

    c.env.DB
      .prepare(`
        SELECT
          status,
          COUNT(*) AS total
        FROM leads
        GROUP BY status
        ORDER BY status
      `)
      .all(),

    c.env.DB
      .prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(
            SUM(commission_amount),
            0
          ) AS commission_total,

          COALESCE(
            SUM(
              CASE
                WHEN commission_status = 'payable'
                THEN commission_amount
                ELSE 0
              END
            ),
            0
          ) AS payable_total,

          COALESCE(
            SUM(
              CASE
                WHEN commission_status = 'paid'
                THEN commission_amount
                ELSE 0
              END
            ),
            0
          ) AS paid_total

        FROM leads
      `)
      .first(),

    c.env.DB
      .prepare(`
        SELECT
          leads.*,
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
          activity_log.*,
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
  return page(
    "Admin Dashboard",
    `
      <div class="card">

        <div class="section-label">
          Admin Control Centre
        </div>

        <h2 class="page-title">
          Welcome, ${escapeHtml(user.name)}
        </h2>

        <p>
          Manage leads, Hunters, dealerships, users and commissions.
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
            ${money(data.commissions.payable_total)}
          </strong>
        </div>

        <div class="stat">
          <h3>Paid Commission</h3>
          <strong>
            ${money(data.commissions.paid_total)}
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
                    <h3>
                      ${escapeHtml(statusLabel(item.status))}
                    </h3>

                    <strong>
                      ${safeNumber(item.total)}
                    </strong>
                  </div>
                `).join("")
              : `
                  <div class="empty">
                    No leads yet.
                  </div>
                `
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
              <th>Action</th>
            </tr>

            ${
              data.recentLeads.length
                ? data.recentLeads.map(lead => `
                    <tr>

                      <td>
                        ${escapeHtml(lead.lead_reference)}
                      </td>

                      <td>
                        ${escapeHtml(lead.customer_name)}
                        <br>
                        <span class="small muted">
                          ${escapeHtml(lead.customer_phone || "")}
                        </span>
                      </td>

                      <td>
                        ${escapeHtml(lead.vehicle_interest || "-")}
                      </td>

                      <td>
                        ${escapeHtml(
                          lead.dealership_name || "Unassigned"
                        )}
                      </td>

                      <td>
                        <span class="badge ${statusClass(lead.status)}">
                          ${escapeHtml(statusLabel(lead.status))}
                        </span>
                      </td>

                      <td>
                        ${money(lead.commission_amount)}
                        <br>
                        <span class="badge ${statusClass(lead.commission_status)}">
                          ${escapeHtml(
                            commissionLabel(
                              lead.commission_status
                            )
                          )}
                        </span>
                      </td>

                      <td>
                        <a
                          class="btn"
                          href="/admin/leads/${lead.id}"
                        >
                          View
                        </a>
                      </td>

                    </tr>
                  `).join("")
                : `
                    <tr>
                      <td colspan="7">
                        <div class="empty">
                          No leads yet.
                        </div>
                      </td>
                    </tr>
                  `
            }

          </table>

        </div>

      </div>

      <div class="card">

        <h2>Recent Activity</h2>

        <div class="table-wrap">

          <table>

            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>

            ${
              data.activity.length
                ? data.activity.map(item => `
                    <tr>

                      <td>
                        ${escapeHtml(item.created_at || "-")}
                      </td>

                      <td>
                        ${escapeHtml(item.user_name || "System")}
                      </td>

                      <td>
                        ${escapeHtml(item.action || "-")}
                      </td>

                      <td>
                        ${escapeHtml(item.details || "-")}
                      </td>

                    </tr>
                  `).join("")
                : `
                    <tr>
                      <td colspan="4">
                        <div class="empty">
                          No activity yet.
                        </div>
                      </td>
                    </tr>
                  `
            }

          </table>

        </div>

      </div>
    `,
    [
      ["/admin", "Dashboard"],
      ["/admin/leads", "Leads"],
      ["/admin/hunters", "Hunters"],
      ["/admin/dealerships", "Dealerships"],
      ["/admin/users", "Users"],
      ["/logout", "Logout"]
    ]
  );
}

/* =========================================================
   ADMIN DASHBOARD ROUTE
   ========================================================= */

app.get("/admin", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) {
    return redirect(c, "/");
  }

  if (user === false) {
    return c.html(forbiddenPage(), 403);
  }

  try {
    const data = await getDashboardData(c);

    return c.html(
      adminDashboard(user, data)
    );
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return c.html(
      page(
        "Admin Error",
        `
          <div class="card">
            <h2>Dashboard Error</h2>
            <p>
              The dashboard could not load the database information.
            </p>
          </div>
        `,
        [
          ["/admin", "Dashboard"],
          ["/logout", "Logout"]
        ]
      ),
      500
    );
  }
});

/* =========================================================
   ADMIN LEADS
   ========================================================= */

app.get("/admin/leads", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const leads = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name,
        hunters.name AS hunter_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      LEFT JOIN hunters
        ON hunters.id = leads.hunter_id
      ORDER BY leads.id DESC
    `)
    .all();

  return c.html(
    page(
      "Lead Control Centre",
      `
        <div class="card">

          <div class="section-label">
            Lead Control Centre
          </div>

          <h2>All Buyer Leads</h2>

          <p>
            Review, approve, decline, assign and manage commissions.
          </p>

        </div>

        <div class="card">

          <div class="table-wrap">

            <table>

              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Hunter</th>
                <th>Dealership</th>
                <th>Status</th>
                <th>Commission</th>
                <th>Action</th>
              </tr>

              ${
                leads.results?.length
                  ? leads.results.map(lead => `
                      <tr>

                        <td>
                          ${escapeHtml(lead.lead_reference)}
                        </td>

                        <td>
                          <strong>
                            ${escapeHtml(lead.customer_name)}
                          </strong>

                          <br>

                          <span class="small muted">
                            ${escapeHtml(lead.customer_phone || "")}
                          </span>
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.vehicle_interest || "-"
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.hunter_name || "Unknown"
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.dealership_name || "Unassigned"
                          )}
                        </td>

                        <td>
                          <span class="badge ${statusClass(lead.status)}">
                            ${escapeHtml(
                              statusLabel(lead.status)
                            )}
                          </span>
                        </td>

                        <td>
                          ${money(lead.commission_amount)}
                          <br>
                          <span class="badge ${statusClass(lead.commission_status)}">
                            ${escapeHtml(
                              commissionLabel(
                                lead.commission_status
                              )
                            )}
                          </span>
                        </td>

                        <td>
                          <a
                            class="btn"
                            href="/admin/leads/${lead.id}"
                          >
                            Manage
                          </a>
                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="8">
                          <div class="empty">
                            No leads found.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/admin/users", "Users"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADMIN LEAD DETAIL
   ========================================================= */

app.get("/admin/leads/:id", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  const lead = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        hunters.name AS hunter_name,
        hunters.phone AS hunter_phone,
        dealerships.name AS dealership_name,
        dealerships.email AS dealership_email
      FROM leads
      LEFT JOIN hunters
        ON hunters.id = leads.hunter_id
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      WHERE leads.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!lead) {
    return c.html(
      page(
        "Lead Not Found",
        `
          <div class="card">
            <h2>Lead Not Found</h2>
            <a class="btn" href="/admin/leads">
              Back to Leads
            </a>
          </div>
        `,
        [["/admin/leads", "Back to Leads"]]
      ),
      404
    );
  }

  const dealerships = await c.env.DB
    .prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        active
      FROM dealerships
      ORDER BY name ASC
    `)
    .all();

  return c.html(
    page(
      `Lead ${lead.lead_reference}`,
      `
        <div class="card">

          <div class="section-label">
            Lead Control Centre
          </div>

          <h2>
            ${escapeHtml(lead.lead_reference)}
          </h2>

          <span class="badge ${statusClass(lead.status)}">
            ${escapeHtml(statusLabel(lead.status))}
          </span>

        </div>

        <div class="two-column">

          <div class="card">

            <h2>Buyer Information</h2>

            <p>
              <strong>Name:</strong>
              ${escapeHtml(lead.customer_name)}
            </p>

            <p>
              <strong>Phone:</strong>
              ${escapeHtml(lead.customer_phone || "-")}
            </p>

            <p>
              <strong>Email:</strong>
              ${escapeHtml(lead.customer_email || "-")}
            </p>

            <p>
              <strong>Area:</strong>
              ${escapeHtml(lead.customer_area || "-")}
            </p>

            <p>
              <strong>Vehicle:</strong>
              ${escapeHtml(lead.vehicle_interest || "-")}
            </p>

            <p>
              <strong>Vehicle Type:</strong>
              ${escapeHtml(lead.vehicle_type || "-")}
            </p>

            <p>
              <strong>Notes:</strong>
              ${escapeHtml(lead.notes || "-")}
            </p>

          </div>

          <div class="card">

            <h2>Lead Ownership</h2>

            <p>
              <strong>Hunter:</strong>
              ${escapeHtml(lead.hunter_name || "-")}
            </p>

            <p>
              <strong>Dealership:</strong>
              ${escapeHtml(
                lead.dealership_name || "Unassigned"
              )}
            </p>

            <p>
              <strong>Created:</strong>
              ${escapeHtml(lead.created_at || "-")}
            </p>

            <p>
              <strong>Approved:</strong>
              ${escapeHtml(lead.approved_at || "-")}
            </p>

            <p>
              <strong>Assigned:</strong>
              ${escapeHtml(lead.assigned_at || "-")}
            </p>

          </div>

        </div>

        <div class="card">

          <h2>Admin Lead Controls</h2>

          <form
            method="POST"
            action="/admin/leads/${lead.id}/update"
          >

            <div class="form-grid">

              <div>

                <label>Status</label>

                <select name="status">

                  ${LEAD_STATUSES.map(status => `
                    <option
                      value="${status}"
                      ${lead.status === status ? "selected" : ""}
                    >
                      ${escapeHtml(statusLabel(status))}
                    </option>
                  `).join("")}

                </select>

              </div>

              <div>

                <label>Assign Dealership</label>

                <select name="dealership_id">

                  <option value="">
                    Unassigned
                  </option>

                  ${
                    dealerships.results?.map(dealer => `
                      <option
                        value="${dealer.id}"
                        ${
                          String(lead.dealership_id || "") ===
                          String(dealer.id)
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(dealer.name)}
                      </option>
                    `).join("") || ""
                  }

                </select>

              </div>

              <div>

                <label>Commission Amount</label>

                <input
                  type="number"
                  name="commission_amount"
                  step="0.01"
                  min="0"
                  value="${escapeHtml(
                    lead.commission_amount || 0
                  )}"
                >

              </div>

              <div>

                <label>Commission Status</label>

                <select name="commission_status">

                  ${COMMISSION_STATUSES.map(status => `
                    <option
                      value="${status}"
                      ${
                        lead.commission_status === status
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        commissionLabel(status)
                      )}
                    </option>
                  `).join("")}

                </select>

              </div>

            </div>

            <br>

            <button class="btn gold" type="submit">
              Save Lead Changes
            </button>

          </form>

        </div>

        <div class="card">

          <h2>Lead Actions</h2>

          <div class="actions">

            ${
              ["new", "pending"].includes(lead.status)
                ? `
                  <form
                    method="POST"
                    action="/admin/leads/${lead.id}/review"
                  >
                    <input
                      type="hidden"
                      name="decision"
                      value="approved"
                    >

                    <button class="btn green" type="submit">
                      Approve Lead
                    </button>
                  </form>

                  <form
                    method="POST"
                    action="/admin/leads/${lead.id}/review"
                  >
                    <input
                      type="hidden"
                      name="decision"
                      value="declined"
                    >

                    <button class="btn red" type="submit">
                      Decline Lead
                    </button>
                  </form>
                `
                : ""
            }

            ${
              lead.commission_status === "pending"
                ? `
                  <form
                    method="POST"
                    action="/admin/leads/${lead.id}/commission"
                  >
                    <input
                      type="hidden"
                      name="status"
                      value="payable"
                    >

                    <button class="btn gold" type="submit">
                      Mark Commission Payable
                    </button>
                  </form>
                `
                : ""
            }

            ${
              lead.commission_status === "payable"
                ? `
                  <form
                    method="POST"
                    action="/admin/leads/${lead.id}/commission"
                  >
                    <input
                      type="hidden"
                      name="status"
                      value="paid"
                    >

                    <button class="btn green" type="submit">
                      Mark Commission Paid
                    </button>
                  </form>
                `
                : ""
            }

          </div>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Back to Leads"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADMIN UPDATE LEAD
   ========================================================= */

app.post("/admin/leads/:id/update", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();

  const status = formValue(body, "status");
  const dealershipId = formValue(body, "dealership_id");
  const commissionAmount = safeNumber(
    formValue(body, "commission_amount"),
    0
  );
  const commissionStatus = formValue(
    body,
    "commission_status"
  );

  if (!LEAD_STATUSES.includes(status)) {
    return c.text("Invalid lead status.", 400);
  }

  if (!COMMISSION_STATUSES.includes(commissionStatus)) {
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

  let assignedAt = lead.assigned_at;

  if (
    dealershipId &&
    String(lead.dealership_id || "") !== dealershipId
  ) {
    assignedAt = now();
  }

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET
        status = ?,
        dealership_id = ?,
        assigned_at = ?,
        commission_amount = ?,
        commission_status = ?
      WHERE id = ?
    `)
    .bind(
      status,
      dealershipId || null,
      assignedAt || null,
      commissionAmount,
      commissionStatus,
      id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    "lead_updated",
    `Lead ${lead.lead_reference} updated to ${status}`,
    id
  );

  return redirect(
    c,
    `/admin/leads/${id}`
  );
});

/* =========================================================
   ADMIN REVIEW LEAD
   ========================================================= */

app.post("/admin/leads/:id/review", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const decision = formValue(body, "decision");

  if (!["approved", "declined"].includes(decision)) {
    return c.text("Invalid decision.", 400);
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

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET
        status = ?,
        approved_at = ?
      WHERE id = ?
    `)
    .bind(
      decision,
      decision === "approved" ? now() : null,
      id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    decision === "approved"
      ? "lead_approved"
      : "lead_declined",
    `${lead.lead_reference} was ${decision}`,
    id
  );

  return redirect(
    c,
    `/admin/leads/${id}`
  );
});

/* =========================================================
   ADMIN COMMISSION
   ========================================================= */

app.post("/admin/leads/:id/commission", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const status = formValue(body, "status");

  if (!COMMISSION_STATUSES.includes(status)) {
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

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET commission_status = ?
      WHERE id = ?
    `)
    .bind(status, id)
    .run();

  await logActivity(
    c,
    user.user_id,
    "commission_updated",
    `${lead.lead_reference} commission marked ${status}`,
    id
  );

  return redirect(
    c,
    `/admin/leads/${id}`
  );
});

/* =========================================================
   ADMIN HUNTERS
   ========================================================= */

app.get("/admin/hunters", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const hunters = await c.env.DB
    .prepare(`
      SELECT
        hunters.*,
        users.email,
        users.active AS user_active,
        users.id AS user_id
      FROM hunters
      LEFT JOIN users
        ON users.id = hunters.user_id
      ORDER BY hunters.id DESC
    `)
    .all();

  return c.html(
    page(
      "Lead Hunters",
      `
        <div class="card">

          <div class="section-label">
            Lead Hunter Management
          </div>

          <h2>Lead Hunters</h2>

          <p>
            Hunters are created manually by Admin.
            There is no public Hunter recruitment or signup system.
          </p>

          <a
            class="btn gold"
            href="/admin/hunters/new"
          >
            + Add Hunter
          </a>

        </div>

        <div class="card">

          <div class="table-wrap">

            <table>

              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Area</th>
                <th>Status</th>
                <th>Action</th>
              </tr>

              ${
                hunters.results?.length
                  ? hunters.results.map(hunter => `
                      <tr>

                        <td>
                          <strong>
                            ${escapeHtml(hunter.name)}
                          </strong>
                        </td>

                        <td>
                          ${escapeHtml(hunter.phone || "-")}
                        </td>

                        <td>
                          ${escapeHtml(hunter.email || "-")}
                        </td>

                        <td>
                          ${escapeHtml(hunter.area || "-")}
                        </td>

                        <td>

                          <span
                            class="badge ${
                              hunter.active && hunter.user_active
                                ? "success"
                                : "danger"
                            }"
                          >
                            ${
                              hunter.active && hunter.user_active
                                ? "Active"
                                : "Inactive"
                            }
                          </span>

                        </td>

                        <td>

                          <div class="actions">

                            <a
                              class="btn"
                              href="/admin/hunters/${hunter.id}/edit"
                            >
                              Edit
                            </a>

                            <form
                              method="POST"
                              action="/admin/hunters/${hunter.id}/toggle"
                            >
                              <button
                                class="btn ${
                                  hunter.active
                                    ? "red"
                                    : "green"
                                }"
                                type="submit"
                              >
                                ${
                                  hunter.active
                                    ? "Deactivate"
                                    : "Activate"
                                }
                              </button>
                            </form>

                          </div>

                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="6">
                          <div class="empty">
                            No Hunters have been created.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/admin/users", "Users"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADD HUNTER
   ========================================================= */

app.get("/admin/hunters/new", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  return c.html(
    page(
      "Add Hunter",
      `
        <div class="card">

          <div class="section-label">
            Admin Only
          </div>

          <h2>Add Lead Hunter</h2>

          <p>
            Create the Hunter account manually.
          </p>

          <form method="POST" action="/admin/hunters">

            <div class="form-grid">

              <div>
                <label>Full Name</label>
                <input
                  name="name"
                  required
                >
              </div>

              <div>
                <label>Phone Number</label>
                <input
                  name="phone"
                  required
                >
              </div>

              <div>
                <label>Email / Username</label>
                <input
                  type="email"
                  name="email"
                  required
                >
              </div>

              <div>
                <label>Area</label>
                <input
                  name="area"
                  required
                >
              </div>

              <div>
                <label>Temporary Password</label>
                <input
                  type="password"
                  name="password"
                  minlength="6"
                  required
                >
              </div>

              <div>
                <label>Commission Amount</label>
                <input
                  type="number"
                  name="commission_amount"
                  value="0"
                  step="0.01"
                  min="0"
                >
              </div>

            </div>

            <br>

            <button
              class="btn gold"
              type="submit"
            >
              Create Hunter
            </button>

          </form>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/hunters", "Back to Hunters"],
        ["/logout", "Logout"]
      ]
    )
  );
});

app.post("/admin/hunters", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const body = await c.req.parseBody();

  const name = formValue(body, "name");
  const phone = formValue(body, "phone");
  const email = formValue(body, "email").toLowerCase();
  const area = formValue(body, "area");
  const password = String(body.password || "");
  const commissionAmount = safeNumber(
    formValue(body, "commission_amount"),
    0
  );

  if (!name || !phone || !email || !area || !password) {
    return c.text(
      "Name, phone, email, area and password are required.",
      400
    );
  }

  const existing = await c.env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email) = ?
      LIMIT 1
    `)
    .bind(email)
    .first();

  if (existing) {
    return c.text(
      "A user with that email already exists.",
      409
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    const userResult = await c.env.DB
      .prepare(`
        INSERT INTO users
        (name, email, password_hash, role, active)
        VALUES (?, ?, ?, 'hunter', 1)
      `)
      .bind(
        name,
        email,
        passwordHash
      )
      .run();

    const userId = userResult.meta.last_row_id;

    await c.env.DB
      .prepare(`
        INSERT INTO hunters
        (user_id, name, phone, area, active)
        VALUES (?, ?, ?, ?, 1)
      `)
      .bind(
        userId,
        name,
        phone,
        area
      )
      .run();

    await logActivity(
      c,
      user.user_id,
      "hunter_created",
      `Hunter ${name} created`
    );

    return redirect(
      c,
      "/admin/hunters"
    );

  } catch (error) {
    console.error("Hunter creation error:", error);

    return c.text(
      "Could not create Hunter. Check the database fields.",
      500
    );
  }
});

/* =========================================================
   EDIT HUNTER
   ========================================================= */

app.get("/admin/hunters/:id/edit", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  const hunter = await c.env.DB
    .prepare(`
      SELECT
        hunters.*,
        users.email,
        users.active AS user_active
      FROM hunters
      LEFT JOIN users
        ON users.id = hunters.user_id
      WHERE hunters.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!hunter) {
    return c.text("Hunter not found.", 404);
  }

  return c.html(
    page(
      "Edit Hunter",
      `
        <div class="card">

          <h2>Edit Hunter</h2>

          <form
            method="POST"
            action="/admin/hunters/${hunter.id}/edit"
          >

            <div class="form-grid">

              <div>
                <label>Full Name</label>
                <input
                  name="name"
                  value="${escapeHtml(hunter.name)}"
                  required
                >
              </div>

              <div>
                <label>Phone</label>
                <input
                  name="phone"
                  value="${escapeHtml(hunter.phone || "")}"
                >
              </div>

              <div>
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value="${escapeHtml(hunter.email || "")}"
                  required
                >
              </div>

              <div>
                <label>Area</label>
                <input
                  name="area"
                  value="${escapeHtml(hunter.area || "")}"
                >
              </div>

              <div>
                <label>New Password</label>
                <input
                  type="password"
                  name="password"
                  minlength="6"
                  placeholder="Leave blank to keep current password"
                >
              </div>

            </div>

            <br>

            <button
              class="btn gold"
              type="submit"
            >
              Save Hunter
            </button>

          </form>

        </div>
      `,
      [
        ["/admin/hunters", "Back to Hunters"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

app.post("/admin/hunters/:id/edit", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();

  const name = formValue(body, "name");
  const phone = formValue(body, "phone");
  const email = formValue(body, "email").toLowerCase();
  const area = formValue(body, "area");
  const password = String(body.password || "");

  const hunter = await c.env.DB
    .prepare(`
      SELECT *
      FROM hunters
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!hunter) {
    return c.text("Hunter not found.", 404);
  }

  const duplicate = await c.env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email) = ?
        AND id != ?
      LIMIT 1
    `)
    .bind(
      email,
      hunter.user_id
    )
    .first();

  if (duplicate) {
    return c.text(
      "That email is already being used.",
      409
    );
  }

  await c.env.DB
    .prepare(`
      UPDATE hunters
      SET
        name = ?,
        phone = ?,
        area = ?
      WHERE id = ?
    `)
    .bind(
      name,
      phone,
      area,
      id
    )
    .run();

  if (password) {
    const passwordHash = await hashPassword(password);

    await c.env.DB
      .prepare(`
        UPDATE users
        SET
          name = ?,
          email = ?,
          password_hash = ?
        WHERE id = ?
      `)
      .bind(
        name,
        email,
        passwordHash,
        hunter.user_id
      )
      .run();
  } else {
    await c.env.DB
      .prepare(`
        UPDATE users
        SET
          name = ?,
          email = ?
        WHERE id = ?
      `)
      .bind(
        name,
        email,
        hunter.user_id
      )
      .run();
  }

  await logActivity(
    c,
    user.user_id,
    "hunter_updated",
    `Hunter ${name} updated`
  );

  return redirect(
    c,
    "/admin/hunters"
  );
});

/* =========================================================
   TOGGLE HUNTER
   ========================================================= */

app.post("/admin/hunters/:id/toggle", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  const hunter = await c.env.DB
    .prepare(`
      SELECT *
      FROM hunters
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!hunter) {
    return c.text("Hunter not found.", 404);
  }

  const newStatus = hunter.active ? 0 : 1;

  await c.env.DB
    .prepare(`
      UPDATE hunters
      SET active = ?
      WHERE id = ?
    `)
    .bind(
      newStatus,
      id
    )
    .run();

  await c.env.DB
    .prepare(`
      UPDATE users
      SET active = ?
      WHERE id = ?
    `)
    .bind(
      newStatus,
      hunter.user_id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    newStatus
      ? "hunter_activated"
      : "hunter_deactivated",
    `Hunter ${hunter.name} status changed`
  );

  return redirect(
    c,
    "/admin/hunters"
  );
});

/* =========================================================
   ADMIN DEALERSHIPS
   ========================================================= */

app.get("/admin/dealerships", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const dealerships = await c.env.DB
    .prepare(`
      SELECT
        dealerships.*,
        users.id AS user_id,
        users.active AS user_active
      FROM dealerships
      LEFT JOIN users
        ON users.email = dealerships.email
      ORDER BY dealerships.id DESC
    `)
    .all();

  return c.html(
    page(
      "Dealerships",
      `
        <div class="card">

          <div class="section-label">
            Dealership Management
          </div>

          <h2>Dealerships</h2>

          <p>
            Manage dealership accounts that receive approved leads.
          </p>

          <a
            class="btn gold"
            href="/admin/dealerships/new"
          >
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
                <th>Location</th>
                <th>Status</th>
                <th>Action</th>
              </tr>

              ${
                dealerships.results?.length
                  ? dealerships.results.map(dealer => `
                      <tr>

                        <td>
                          <strong>
                            ${escapeHtml(dealer.name)}
                          </strong>
                        </td>

                        <td>
                          ${escapeHtml(dealer.email || "-")}
                        </td>

                        <td>
                          ${escapeHtml(dealer.phone || "-")}
                        </td>

                        <td>
                          ${escapeHtml(
                            dealer.location || "-"
                          )}
                        </td>

                        <td>
                          <span
                            class="badge ${
                              dealer.active
                                ? "success"
                                : "danger"
                            }"
                          >
                            ${
                              dealer.active
                                ? "Active"
                                : "Inactive"
                            }
                          </span>
                        </td>

                        <td>

                          <div class="actions">

                            <a
                              class="btn"
                              href="/admin/dealerships/${dealer.id}/edit"
                            >
                              Edit
                            </a>

                            <form
                              method="POST"
                              action="/admin/dealerships/${dealer.id}/toggle"
                            >
                              <button
                                class="btn ${
                                  dealer.active
                                    ? "red"
                                    : "green"
                                }"
                                type="submit"
                              >
                                ${
                                  dealer.active
                                    ? "Deactivate"
                                    : "Activate"
                                }
                              </button>
                            </form>

                          </div>

                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="6">
                          <div class="empty">
                            No dealerships have been created.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/admin/users", "Users"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   ADD DEALERSHIP
   ========================================================= */

app.get("/admin/dealerships/new", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  return c.html(
    page(
      "Add Dealership",
      `
        <div class="card">

          <div class="section-label">
            Admin Only
          </div>

          <h2>Add Dealership</h2>

          <form
            method="POST"
            action="/admin/dealerships"
          >

            <div class="form-grid">

              <div>
                <label>Dealership Name</label>
                <input
                  name="name"
                  required
                >
              </div>

              <div>
                <label>Email / Username</label>
                <input
                  type="email"
                  name="email"
                  required
                >
              </div>

              <div>
                <label>Phone</label>
                <input
                  name="phone"
                >
              </div>

              <div>
                <label>Location</label>
                <input
                  name="location"
                >
              </div>

              <div>
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  minlength="6"
                  required
                >
              </div>

            </div>

            <br>

            <button
              class="btn gold"
              type="submit"
            >
              Create Dealership
            </button>

          </form>

        </div>
      `,
      [
        ["/admin/dealerships", "Back to Dealerships"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

app.post("/admin/dealerships", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const body = await c.req.parseBody();

  const name = formValue(body, "name");
  const email = formValue(body, "email").toLowerCase();
  const phone = formValue(body, "phone");
  const location = formValue(body, "location");
  const password = String(body.password || "");

  if (!name || !email || !password) {
    return c.text(
      "Name, email and password are required.",
      400
    );
  }

  const existing = await c.env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email) = ?
      LIMIT 1
    `)
    .bind(email)
    .first();

  if (existing) {
    return c.text(
      "A user with that email already exists.",
      409
    );
  }

  try {
    const passwordHash = await hashPassword(password);

    const userResult = await c.env.DB
      .prepare(`
        INSERT INTO users
        (name, email, password_hash, role, active)
        VALUES (?, ?, ?, 'dealership', 1)
      `)
      .bind(
        name,
        email,
        passwordHash
      )
      .run();

    const userId = userResult.meta.last_row_id;

    await c.env.DB
      .prepare(`
        INSERT INTO dealerships
        (name, email, phone, location, active)
        VALUES (?, ?, ?, ?, 1)
      `)
      .bind(
        name,
        email,
        phone,
        location
      )
      .run();

    await logActivity(
      c,
      user.user_id,
      "dealership_created",
      `Dealership ${name} created`
    );

    return redirect(
      c,
      "/admin/dealerships"
    );

  } catch (error) {
    console.error(
      "Dealership creation error:",
      error
    );

    return c.text(
      "Could not create dealership.",
      500
    );
  }
});

/* =========================================================
   EDIT DEALERSHIP
   ========================================================= */

app.get("/admin/dealerships/:id/edit", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  const dealer = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!dealer) {
    return c.text(
      "Dealership not found.",
      404
    );
  }

  return c.html(
    page(
      "Edit Dealership",
      `
        <div class="card">

          <h2>Edit Dealership</h2>

          <form
            method="POST"
            action="/admin/dealerships/${dealer.id}/edit"
          >

            <div class="form-grid">

              <div>
                <label>Name</label>
                <input
                  name="name"
                  value="${escapeHtml(dealer.name)}"
                  required
                >
              </div>

              <div>
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value="${escapeHtml(dealer.email || "")}"
                  required
                >
              </div>

              <div>
                <label>Phone</label>
                <input
                  name="phone"
                  value="${escapeHtml(dealer.phone || "")}"
                >
              </div>

              <div>
                <label>Location</label>
                <input
                  name="location"
                  value="${escapeHtml(dealer.location || "")}"
                >
              </div>

              <div>
                <label>New Password</label>
                <input
                  type="password"
                  name="password"
                  minlength="6"
                  placeholder="Leave blank to keep current password"
                >
              </div>

            </div>

            <br>

            <button
              class="btn gold"
              type="submit"
            >
              Save Dealership
            </button>

          </form>

        </div>
      `,
      [
        ["/admin/dealerships", "Back to Dealerships"],
        ["/admin", "Dashboard"],
        ["/logout", "Logout"]
      ]
    )
  );
});

app.post("/admin/dealerships/:id/edit", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");
  const body = await c.req.parseBody();

  const name = formValue(body, "name");
  const email = formValue(body, "email").toLowerCase();
  const phone = formValue(body, "phone");
  const location = formValue(body, "location");
  const password = String(body.password || "");

  const dealer = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!dealer) {
    return c.text(
      "Dealership not found.",
      404
    );
  }

  const oldEmail = String(dealer.email || "").toLowerCase();

  await c.env.DB
    .prepare(`
      UPDATE dealerships
      SET
        name = ?,
        email = ?,
        phone = ?,
        location = ?
      WHERE id = ?
    `)
    .bind(
      name,
      email,
      phone,
      location,
      id
    )
    .run();

  if (password) {
    const passwordHash = await hashPassword(password);

    await c.env.DB
      .prepare(`
        UPDATE users
        SET
          name = ?,
          email = ?,
          password_hash = ?
        WHERE LOWER(email) = ?
          AND role = 'dealership'
      `)
      .bind(
        name,
        email,
        passwordHash,
        oldEmail
      )
      .run();
  } else {
    await c.env.DB
      .prepare(`
        UPDATE users
        SET
          name = ?,
          email = ?
        WHERE LOWER(email) = ?
          AND role = 'dealership'
      `)
      .bind(
        name,
        email,
        oldEmail
      )
      .run();
  }

  await logActivity(
    c,
    user.user_id,
    "dealership_updated",
    `Dealership ${name} updated`
  );

  return redirect(
    c,
    "/admin/dealerships"
  );
});

/* =========================================================
   TOGGLE DEALERSHIP
   ========================================================= */

app.post("/admin/dealerships/:id/toggle", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  const dealer = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!dealer) {
    return c.text(
      "Dealership not found.",
      404
    );
  }

  const newStatus = dealer.active ? 0 : 1;

  await c.env.DB
    .prepare(`
      UPDATE dealerships
      SET active = ?
      WHERE id = ?
    `)
    .bind(
      newStatus,
      id
    )
    .run();

  await c.env.DB
    .prepare(`
      UPDATE users
      SET active = ?
      WHERE LOWER(email) = ?
        AND role = 'dealership'
    `)
    .bind(
      newStatus,
      String(dealer.email || "").toLowerCase()
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    newStatus
      ? "dealership_activated"
      : "dealership_deactivated",
    `Dealership ${dealer.name} status changed`
  );

  return redirect(
    c,
    "/admin/dealerships"
  );
});

/* =========================================================
   ADMIN USERS
   ========================================================= */

app.get("/admin/users", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

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

  return c.html(
    page(
      "Users",
      `
        <div class="card">

          <div class="section-label">
            User Administration
          </div>

          <h2>System Users</h2>

          <p>
            Admin can view and control account status.
          </p>

        </div>

        <div class="card">

          <div class="table-wrap">

            <table>

              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>

              ${
                users.results?.length
                  ? users.results.map(item => `
                      <tr>

                        <td>
                          ${escapeHtml(item.name)}
                        </td>

                        <td>
                          ${escapeHtml(item.email)}
                        </td>

                        <td>
                          <span class="badge info">
                            ${escapeHtml(item.role)}
                          </span>
                        </td>

                        <td>
                          <span class="badge ${
                            item.active
                              ? "success"
                              : "danger"
                          }">
                            ${
                              item.active
                                ? "Active"
                                : "Inactive"
                            }
                          </span>
                        </td>

                        <td>
                          ${escapeHtml(
                            item.created_at || "-"
                          )}
                        </td>

                        <td>

                          ${
                            item.id !== user.user_id
                              ? `
                                <form
                                  method="POST"
                                  action="/admin/users/${item.id}/toggle"
                                >
                                  <button
                                    class="btn ${
                                      item.active
                                        ? "red"
                                        : "green"
                                    }"
                                    type="submit"
                                  >
                                    ${
                                      item.active
                                        ? "Deactivate"
                                        : "Activate"
                                    }
                                  </button>
                                </form>
                              `
                              : `
                                <span class="muted small">
                                  Current account
                                </span>
                              `
                          }

                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="6">
                          <div class="empty">
                            No users found.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/admin", "Dashboard"],
        ["/admin/leads", "Leads"],
        ["/admin/hunters", "Hunters"],
        ["/admin/dealerships", "Dealerships"],
        ["/admin/users", "Users"],
        ["/logout", "Logout"]
      ]
    )
  );
});

app.post("/admin/users/:id/toggle", async (c) => {
  const user = await requireRole(c, "admin");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const id = c.req.param("id");

  if (String(id) === String(user.user_id)) {
    return c.text(
      "You cannot deactivate your own account.",
      400
    );
  }

  const target = await c.env.DB
    .prepare(`
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  if (!target) {
    return c.text(
      "User not found.",
      404
    );
  }

  const newStatus = target.active ? 0 : 1;

  await c.env.DB
    .prepare(`
      UPDATE users
      SET active = ?
      WHERE id = ?
    `)
    .bind(
      newStatus,
      id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    newStatus
      ? "user_activated"
      : "user_deactivated",
    `User ${target.email} status changed`
  );

  return redirect(
    c,
    "/admin/users"
  );
});

/* =========================================================
   HUNTER DASHBOARD
   ========================================================= */

app.get("/hunter", async (c) => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT *
      FROM hunters
      WHERE user_id = ?
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.html(
      page(
        "Hunter Account",
        `
          <div class="card">
            <h2>Hunter profile not found</h2>
            <p>
              Please contact the administrator.
            </p>
          </div>
        `,
        [["/logout", "Logout"]]
      ),
      404
    );
  }

  const stats = await c.env.DB
    .prepare(`
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'sold'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS sold,

        COALESCE(
          SUM(commission_amount),
          0
        ) AS commission_total,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'payable'
              THEN commission_amount
              ELSE 0
            END
          ),
          0
        ) AS payable,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'paid'
              THEN commission_amount
              ELSE 0
            END
          ),
          0
        ) AS paid

      FROM leads
      WHERE hunter_id = ?
    `)
    .bind(hunter.id)
    .first();

  return c.html(
    page(
      "Hunter Dashboard",
      `
        <div class="card">

          <div class="section-label">
            Lead Hunter Portal
          </div>

          <h2>
            Welcome, ${escapeHtml(user.name)}
          </h2>

          <p>
            Submit buyer leads and track your lead and commission progress.
          </p>

        </div>

        <div class="grid">

          <div class="stat">
            <h3>My Leads</h3>
            <strong>${safeNumber(stats?.total)}</strong>
          </div>

          <div class="stat">
            <h3>Sold</h3>
            <strong>${safeNumber(stats?.sold)}</strong>
          </div>

          <div class="stat">
            <h3>Payable</h3>
            <strong>${money(stats?.payable)}</strong>
          </div>

          <div class="stat">
            <h3>Paid</h3>
            <strong>${money(stats?.paid)}</strong>
          </div>

        </div>

        <div class="card">

          <h2>Hunter Menu</h2>

          <div class="actions">

            <a
              class="btn gold"
              href="/hunter/leads/new"
            >
              + Submit Buyer
            </a>

            <a
              class="btn"
              href="/hunter/leads"
            >
              My Leads
            </a>

            <a
              class="btn green"
              href="/hunter/earnings"
            >
              My Earnings
            </a>

          </div>

        </div>
      `,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads/new", "Submit Buyer"],
        ["/hunter/leads", "My Leads"],
        ["/hunter/earnings", "My Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   HUNTER NEW LEAD
   ========================================================= */

app.get("/hunter/leads/new", async (c) => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  return c.html(
    page(
      "Submit Buyer",
      `
        <div class="card">

          <div class="section-label">
            Lead Hunter
          </div>

          <h2>Submit Buyer Lead</h2>

          <p>
            Enter genuine buyer information for Admin review.
          </p>

          <form
            method="POST"
            action="/hunter/leads"
          >

            <div class="form-grid">

              <div>
                <label>Customer Name</label>
                <input
                  name="customer_name"
                  required
                >
              </div>

              <div>
                <label>Customer Phone</label>
                <input
                  name="customer_phone"
                  required
                >
              </div>

              <div>
                <label>Customer Email</label>
                <input
                  type="email"
                  name="customer_email"
                >
              </div>

              <div>
                <label>Customer Area</label>
                <input
                  name="customer_area"
                >
              </div>

              <div>
                <label>Vehicle Interest</label>
                <input
                  name="vehicle_interest"
                  placeholder="e.g. Kiger"
                  required
                >
              </div>

              <div>
                <label>Vehicle Type</label>

                <select name="vehicle_type">
                  <option value="new">New</option>
                  <option value="used">Used</option>
                  <option value="unknown" selected>
                    Not Specified
                  </option>
                </select>

              </div>

            </div>

            <br>

            <label>Additional Notes</label>

            <textarea
              name="notes"
              placeholder="Budget, preferred model, timing, trade-in etc."
            ></textarea>

            <br>

            <button
              class="btn gold"
              type="submit"
            >
              Submit Buyer Lead
            </button>

          </form>

        </div>
      `,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads", "My Leads"],
        ["/hunter/earnings", "My Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   HUNTER CREATE LEAD
   ========================================================= */

app.post("/hunter/leads", async (c) => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT *
      FROM hunters
      WHERE user_id = ?
        AND active = 1
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text(
      "Hunter account is inactive or missing.",
      403
    );
  }

  const body = await c.req.parseBody();

  const customerName = formValue(
    body,
    "customer_name"
  );

  const customerPhone = formValue(
    body,
    "customer_phone"
  );

  const customerEmail = formValue(
    body,
    "customer_email"
  );

  const customerArea = formValue(
    body,
    "customer_area"
  );

  const vehicleInterest = formValue(
    body,
    "vehicle_interest"
  );

  const vehicleType = formValue(
    body,
    "vehicle_type"
  ) || "unknown";

  const notes = formValue(
    body,
    "notes"
  );

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

  const result = await c.env.DB
    .prepare(`
      INSERT INTO leads
      (
        lead_reference,
        hunter_id,
        customer_name,
        customer_phone,
        customer_email,
        customer_area,
        vehicle_interest,
        vehicle_type,
        notes,
        status,
        commission_amount,
        commission_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 'pending')
    `)
    .bind(
      leadReference,
      hunter.id,
      customerName,
      customerPhone,
      customerEmail || null,
      customerArea || null,
      vehicleInterest,
      vehicleType,
      notes || null
    )
    .run();

  const leadId = result.meta.last_row_id;

  await logActivity(
    c,
    user.user_id,
    "lead_submitted",
    `Lead ${leadReference} submitted for review`,
    leadId
  );

  return redirect(
    c,
    "/hunter/leads"
  );
});

/* =========================================================
   HUNTER MY LEADS
   ========================================================= */

app.get("/hunter/leads", async (c) => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT id
      FROM hunters
      WHERE user_id = ?
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text(
      "Hunter profile not found.",
      404
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

  return c.html(
    page(
      "My Leads",
      `
        <div class="card">

          <div class="section-label">
            Hunter Portal
          </div>

          <h2>My Leads</h2>

          <a
            class="btn gold"
            href="/hunter/leads/new"
          >
            + Submit Buyer
          </a>

        </div>

        <div class="card">

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
                leads.results?.length
                  ? leads.results.map(lead => `
                      <tr>

                        <td>
                          ${escapeHtml(lead.lead_reference)}
                        </td>

                        <td>
                          ${escapeHtml(lead.customer_name)}
                          <br>
                          <span class="small muted">
                            ${escapeHtml(
                              lead.customer_phone || ""
                            )}
                          </span>
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.vehicle_interest || "-"
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.dealership_name || "Pending Assignment"
                          )}
                        </td>

                        <td>
                          <span class="badge ${statusClass(lead.status)}">
                            ${escapeHtml(
                              statusLabel(lead.status)
                            )}
                          </span>
                        </td>

                        <td>
                          ${money(lead.commission_amount)}
                          <br>
                          <span class="badge ${statusClass(lead.commission_status)}">
                            ${escapeHtml(
                              commissionLabel(
                                lead.commission_status
                              )
                            )}
                          </span>
                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="6">
                          <div class="empty">
                            You have not submitted any leads yet.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads/new", "Submit Buyer"],
        ["/hunter/leads", "My Leads"],
        ["/hunter/earnings", "My Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   HUNTER EARNINGS
   ========================================================= */

app.get("/hunter/earnings", async (c) => {
  const user = await requireRole(c, "hunter");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const hunter = await c.env.DB
    .prepare(`
      SELECT id
      FROM hunters
      WHERE user_id = ?
      LIMIT 1
    `)
    .bind(user.user_id)
    .first();

  if (!hunter) {
    return c.text(
      "Hunter profile not found.",
      404
    );
  }

  const earnings = await c.env.DB
    .prepare(`
      SELECT
        leads.*,
        dealerships.name AS dealership_name
      FROM leads
      LEFT JOIN dealerships
        ON dealerships.id = leads.dealership_id
      WHERE leads.hunter_id = ?
        AND leads.commission_amount > 0
      ORDER BY leads.id DESC
    `)
    .bind(hunter.id)
    .all();

  const totals = await c.env.DB
    .prepare(`
      SELECT

        COALESCE(
          SUM(commission_amount),
          0
        ) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'payable'
              THEN commission_amount
              ELSE 0
            END
          ),
          0
        ) AS payable,

        COALESCE(
          SUM(
            CASE
              WHEN commission_status = 'paid'
              THEN commission_amount
              ELSE 0
            END
          ),
          0
        ) AS paid

      FROM leads
      WHERE hunter_id = ?
    `)
    .bind(hunter.id)
    .first();

  return c.html(
    page(
      "My Earnings",
      `
        <div class="card">

          <div class="section-label">
            Commission Centre
          </div>

          <h2>My Earnings</h2>

        </div>

        <div class="grid">

          <div class="stat">
            <h3>Total Commission</h3>
            <strong>${money(totals?.total)}</strong>
          </div>

          <div class="stat">
            <h3>Payable</h3>
            <strong>${money(totals?.payable)}</strong>
          </div>

          <div class="stat">
            <h3>Paid</h3>
            <strong>${money(totals?.paid)}</strong>
          </div>

        </div>

        <div class="card">

          <div class="table-wrap">

            <table>

              <tr>
                <th>Lead</th>
                <th>Customer</th>
                <th>Dealership</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>

              ${
                earnings.results?.length
                  ? earnings.results.map(lead => `
                      <tr>

                        <td>
                          ${escapeHtml(
                            lead.lead_reference
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.customer_name
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.dealership_name ||
                            "Unassigned"
                          )}
                        </td>

                        <td>
                          <span class="amount">
                            ${money(
                              lead.commission_amount
                            )}
                          </span>
                        </td>

                        <td>
                          <span class="badge ${statusClass(lead.commission_status)}">
                            ${escapeHtml(
                              commissionLabel(
                                lead.commission_status
                              )
                            )}
                          </span>
                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="5">
                          <div class="empty">
                            No commission records yet.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/hunter", "Dashboard"],
        ["/hunter/leads/new", "Submit Buyer"],
        ["/hunter/leads", "My Leads"],
        ["/hunter/earnings", "My Earnings"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP DASHBOARD
   ========================================================= */

app.get("/dealership", async (c) => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE LOWER(email) = LOWER(?)
        AND active = 1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.html(
      page(
        "Dealership Account",
        `
          <div class="card">
            <h2>Dealership profile not found</h2>
            <p>
              Please contact the administrator.
            </p>
          </div>
        `,
        [["/logout", "Logout"]]
      ),
      404
    );
  }

  const stats = await c.env.DB
    .prepare(`
      SELECT

        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'sold'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS sold,

        COALESCE(
          SUM(
            CASE
              WHEN status IN (
                'new',
                'pending',
                'approved',
                'assigned',
                'contacted',
                'qualified',
                'interested',
                'appointment',
                'test_drive',
                'negotiating'
              )
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS active_leads

      FROM leads
      WHERE dealership_id = ?
    `)
    .bind(dealership.id)
    .first();

  const leads = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE dealership_id = ?
      ORDER BY id DESC
      LIMIT 10
    `)
    .bind(dealership.id)
    .all();

  return c.html(
    page(
      "Dealership Dashboard",
      `
        <div class="card">

          <div class="section-label">
            Dealership Lead Dashboard
          </div>

          <h2>
            ${escapeHtml(dealership.name)}
          </h2>

          <p>
            Manage the leads assigned to your dealership.
          </p>

        </div>

        <div class="grid">

          <div class="stat">
            <h3>Total Assigned Leads</h3>
            <strong>${safeNumber(stats?.total)}</strong>
          </div>

          <div class="stat">
            <h3>Active Leads</h3>
            <strong>${safeNumber(stats?.active_leads)}</strong>
          </div>

          <div class="stat">
            <h3>Sold</h3>
            <strong>${safeNumber(stats?.sold)}</strong>
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
                <th>Action</th>
              </tr>

              ${
                leads.results?.length
                  ? leads.results.map(lead => `
                      <tr>

                        <td>
                          ${escapeHtml(
                            lead.lead_reference
                          )}
                        </td>

                        <td>
                          <strong>
                            ${escapeHtml(
                              lead.customer_name
                            )}
                          </strong>

                          <br>

                          <span class="small">
                            ${escapeHtml(
                              lead.customer_phone || ""
                            )}
                          </span>
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.vehicle_interest || "-"
                          )}
                        </td>

                        <td>
                          <span class="badge ${statusClass(lead.status)}">
                            ${escapeHtml(
                              statusLabel(lead.status)
                            )}
                          </span>
                        </td>

                        <td>
                          <a
                            class="btn"
                            href="/dealership/leads/${lead.id}"
                          >
                            Manage
                          </a>
                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="5">
                          <div class="empty">
                            No leads have been assigned to you.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/dealership", "Dashboard"],
        ["/dealership/leads", "All Leads"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP ALL LEADS
   ========================================================= */

app.get("/dealership/leads", async (c) => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE LOWER(email) = LOWER(?)
        AND active = 1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text(
      "Dealership profile not found.",
      404
    );
  }

  const leads = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE dealership_id = ?
      ORDER BY id DESC
    `)
    .bind(dealership.id)
    .all();

  return c.html(
    page(
      "Dealership Leads",
      `
        <div class="card">

          <div class="section-label">
            Dealership
          </div>

          <h2>Assigned Leads</h2>

        </div>

        <div class="card">

          <div class="table-wrap">

            <table>

              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Action</th>
              </tr>

              ${
                leads.results?.length
                  ? leads.results.map(lead => `
                      <tr>

                        <td>
                          ${escapeHtml(
                            lead.lead_reference
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.customer_name
                          )}
                          <br>
                          ${escapeHtml(
                            lead.customer_phone || ""
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            lead.vehicle_interest || "-"
                          )}
                        </td>

                        <td>
                          <span class="badge ${statusClass(lead.status)}">
                            ${escapeHtml(
                              statusLabel(lead.status)
                            )}
                          </span>
                        </td>

                        <td>
                          <a
                            class="btn"
                            href="/dealership/leads/${lead.id}"
                          >
                            Manage
                          </a>
                        </td>

                      </tr>
                    `).join("")
                  : `
                      <tr>
                        <td colspan="5">
                          <div class="empty">
                            No assigned leads.
                          </div>
                        </td>
                      </tr>
                    `
              }

            </table>

          </div>

        </div>
      `,
      [
        ["/dealership", "Dashboard"],
        ["/dealership/leads", "All Leads"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP LEAD DETAIL
   IMPORTANT:
   DEALERSHIP CAN ONLY SEE ITS OWN LEADS.
   HUNTER INFORMATION IS NEVER DISPLAYED HERE.
   ========================================================= */

app.get("/dealership/leads/:id", async (c) => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE LOWER(email) = LOWER(?)
        AND active = 1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text(
      "Dealership profile not found.",
      404
    );
  }

  const id = c.req.param("id");

  const lead = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE id = ?
        AND dealership_id = ?
      LIMIT 1
    `)
    .bind(
      id,
      dealership.id
    )
    .first();

  if (!lead) {
    return c.html(
      forbiddenPage(),
      403
    );
  }

  return c.html(
    page(
      "Manage Lead",
      `
        <div class="card">

          <div class="section-label">
            Assigned Buyer Lead
          </div>

          <h2>
            ${escapeHtml(
              lead.lead_reference
            )}
          </h2>

          <span class="badge ${statusClass(lead.status)}">
            ${escapeHtml(
              statusLabel(lead.status)
            )}
          </span>

        </div>

        <div class="two-column">

          <div class="card">

            <h2>Customer</h2>

            <p>
              <strong>Name:</strong>
              ${escapeHtml(
                lead.customer_name
              )}
            </p>

            <p>
              <strong>Phone:</strong>
              ${escapeHtml(
                lead.customer_phone || "-"
              )}
            </p>

            <p>
              <strong>Email:</strong>
              ${escapeHtml(
                lead.customer_email || "-"
              )}
            </p>

            <p>
              <strong>Area:</strong>
              ${escapeHtml(
                lead.customer_area || "-"
              )}
            </p>

          </div>

          <div class="card">

            <h2>Vehicle Interest</h2>

            <p>
              <strong>Vehicle:</strong>
              ${escapeHtml(
                lead.vehicle_interest || "-"
              )}
            </p>

            <p>
              <strong>Type:</strong>
              ${escapeHtml(
                lead.vehicle_type || "-"
              )}
            </p>

            <p>
              <strong>Notes:</strong>
              ${escapeHtml(
                lead.notes || "-"
              )}
            </p>

          </div>

        </div>

        <div class="card">

          <h2>Update Lead Status</h2>

          <form
            method="POST"
            action="/dealership/leads/${lead.id}/status"
          >

            <label>
              Current Status
            </label>

            <select name="status">

              ${[
                "contacted",
                "qualified",
                "interested",
                "appointment",
                "test_drive",
                "negotiating",
                "sold",
                "lost",
                "cancelled"
              ].map(status => `
                <option
                  value="${status}"
                  ${
                    lead.status === status
                      ? "selected"
                      : ""
                  }
                >
                  ${escapeHtml(
                    statusLabel(status)
                  )}
                </option>
              `).join("")}

            </select>

            <br><br>

            <button
              class="btn gold"
              type="submit"
            >
              Update Status
            </button>

          </form>

        </div>
      `,
      [
        ["/dealership", "Dashboard"],
        ["/dealership/leads", "All Leads"],
        ["/logout", "Logout"]
      ]
    )
  );
});

/* =========================================================
   DEALERSHIP UPDATE LEAD STATUS
   ========================================================= */

app.post("/dealership/leads/:id/status", async (c) => {
  const user = await requireRole(c, "dealership");

  if (!user) return redirect(c, "/");
  if (user === false) return c.html(forbiddenPage(), 403);

  const dealership = await c.env.DB
    .prepare(`
      SELECT *
      FROM dealerships
      WHERE LOWER(email) = LOWER(?)
        AND active = 1
      LIMIT 1
    `)
    .bind(user.email)
    .first();

  if (!dealership) {
    return c.text(
      "Dealership profile not found.",
      404
    );
  }

  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const status = formValue(body, "status");

  const dealershipAllowedStatuses = [
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

  if (!dealershipAllowedStatuses.includes(status)) {
    return c.text(
      "Invalid dealership lead status.",
      400
    );
  }

  const lead = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      WHERE id = ?
        AND dealership_id = ?
      LIMIT 1
    `)
    .bind(
      id,
      dealership.id
    )
    .first();

  if (!lead) {
    return c.html(
      forbiddenPage(),
      403
    );
  }

  let commissionStatus = lead.commission_status;

  /*
   * A SOLD lead becomes commission-payable.
   * Admin can later mark it PAID.
   */
  if (
    status === "sold" &&
    Number(lead.commission_amount || 0) > 0
  ) {
    commissionStatus = "payable";
  }

  await c.env.DB
    .prepare(`
      UPDATE leads
      SET
        status = ?,
        commission_status = ?
      WHERE id = ?
        AND dealership_id = ?
    `)
    .bind(
      status,
      commissionStatus,
      id,
      dealership.id
    )
    .run();

  await logActivity(
    c,
    user.user_id,
    "dealership_lead_status_updated",
    `Lead ${lead.lead_reference} updated to ${status}`,
    id
  );

  return redirect(
    c,
    `/dealership/leads/${id}`
  );
});

/* =========================================================
   API: CURRENT USER
   ========================================================= */

app.get("/api/me", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.json(
      {
        authenticated: false
      },
      401
    );
  }

  return c.json({
    authenticated: true,
    user: {
      id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: Boolean(user.active)
    }
  });
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: BRAND.name,
    timestamp: now()
  });
});

/* =========================================================
   API STATUS
   ========================================================= */

app.get("/api/status", async (c) => {
  try {
    const result = await c.env.DB
      .prepare(`
        SELECT 1 AS ok
      `)
      .first();

    return c.json({
      ok: true,
      database: Boolean(result?.ok),
      service: BRAND.name,
      timestamp: now()
    });

  } catch (error) {
    return c.json(
      {
        ok: false,
        database: false,
        service: BRAND.name,
        error: "Database unavailable"
      },
      500
    );
  }
});

/* =========================================================
   404
   ========================================================= */

app.notFound((c) => {
  return c.html(
    page(
      "Page Not Found",
      `
        <div class="card">

          <div class="section-label">
            404
          </div>

          <h2>Page Not Found</h2>

          <p>
            The page you requested does not exist.
          </p>

          <a
            class="btn"
            href="/"
          >
            Return Home
          </a>

        </div>
      `,
      [
        ["/", "Home"],
        ["/logout", "Logout"]
      ]
    ),
    404
  );
});

/* =========================================================
   GLOBAL ERROR HANDLER
   ========================================================= */

app.onError((error, c) => {
  console.error(
    "Unhandled Worker error:",
    error
  );

  return c.html(
    page(
      "System Error",
      `
        <div class="card">

          <div class="section-label">
            System
          </div>

          <h2>
            Something went wrong
          </h2>

          <p>
            The system encountered an unexpected error.
          </p>

          <a
            class="btn"
            href="/"
          >
            Return Home
          </a>

        </div>
      `,
      [
        ["/", "Home"],
        ["/logout", "Logout"]
      ]
    ),
    500
  );
});

/* =========================================================
   EXPORT
   ========================================================= */

export default app;
