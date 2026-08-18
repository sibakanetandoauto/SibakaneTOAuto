import { Hono } from "hono";

const app = new Hono();

/* =========================
   HELPERS
========================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSessionId(c) {
  const cookie = c.req.header("Cookie") || "";

  const match = cookie.match(
    /(?:^|;\s*)session_id=([^;]+)/
  );

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

function loginPage(error = "") {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>Sibakane T & O Auto</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .login-box {
      width: 100%;
      max-width: 420px;
      background: white;
      padding: 30px;
      border-radius: 16px;
      box-shadow: 0 10px 35px rgba(0,0,0,.12);
    }

    .logo {
      text-align: center;
      margin-bottom: 25px;
    }

    .logo h1 {
      margin: 0;
      font-size: 25px;
    }

    .logo p {
      margin: 8px 0 0;
      color: #777;
    }

    label {
      display: block;
      margin-top: 15px;
      font-weight: bold;
    }

    input {
      width: 100%;
      padding: 14px;
      margin-top: 7px;
      border: 1px solid #ccc;
      border-radius: 8px;
      font-size: 16px;
    }

    button {
      width: 100%;
      margin-top: 22px;
      padding: 14px;
      border: 0;
      border-radius: 8px;
      background: #222;
      color: white;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }

    button:hover {
      opacity: .9;
    }

    .error {
      background: #ffe7e7;
      color: #b00020;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 15px;
      text-align: center;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      color: #888;
      font-size: 13px;
    }
  </style>
</head>

<body>

  <div class="login-box">

    <div class="logo">
      <h1>Sibakane T & O Auto</h1>
      <p>Secure Management System</p>
    </div>

    ${
      error
        ? `<div class="error">${error}</div>`
        : ""
    }

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

function adminDashboard(user) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>Admin Dashboard - Sibakane T & O Auto</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
    }

    header {
      background: #222;
      color: white;
      padding: 18px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
    }

    header h1 {
      margin: 0;
      font-size: 20px;
    }

    .logout {
      color: white;
      text-decoration: none;
      background: #555;
      padding: 9px 14px;
      border-radius: 7px;
      font-size: 14px;
    }

    main {
      max-width: 1100px;
      margin: auto;
      padding: 25px 20px;
    }

    .welcome {
      background: white;
      padding: 22px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 3px 15px rgba(0,0,0,.06);
    }

    .welcome h2 {
      margin-top: 0;
    }

    .cards {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }

    .card {
      background: white;
      padding: 22px;
      border-radius: 12px;
      box-shadow: 0 3px 15px rgba(0,0,0,.06);
    }

    .card h3 {
      margin-top: 0;
    }

    .role {
      display: inline-block;
      background: #222;
      color: white;
      padding: 5px 9px;
      border-radius: 5px;
      font-size: 12px;
      text-transform: uppercase;
    }

    .status {
      color: #16833b;
      font-weight: bold;
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

    <h2>Admin Dashboard</h2>

    <p>
      Welcome,
      <strong>${escapeHtml(user.name)}</strong>.
    </p>

    <p>
      Email:
      ${escapeHtml(user.email)}
    </p>

    <span class="role">
      ${escapeHtml(user.role)}
    </span>

  </div>

  <div class="cards">

    <div class="card">
      <h3>Lead Control</h3>
      <p>Manage and monitor vehicle leads.</p>
    </div>

    <div class="card">
      <h3>Lead Hunters</h3>
      <p>Manage registered lead hunters.</p>
    </div>

    <div class="card">
      <h3>Dealerships</h3>
      <p>Manage dealership accounts.</p>
    </div>

    <div class="card">
      <h3>Users</h3>
      <p>Manage system users and access.</p>
    </div>

    <div class="card">
      <h3>System Status</h3>
      <p class="status">● Online</p>
    </div>

  </div>

</main>

</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   HOME / LOGIN
========================= */

app.get("/", async (c) => {
  try {
    const user = await getCurrentUser(c);

    if (user) {
      if (user.role === "admin") {
        return c.html(adminDashboard(user));
      }

      return c.html(`
        <h1>Sibakane T & O Auto</h1>
        <p>Welcome ${escapeHtml(user.name)}</p>
        <p>Role: ${escapeHtml(user.role)}</p>
        <a href="/logout">Logout</a>
      `);
    }

    return c.html(loginPage());

  } catch (error) {
    return c.html(loginPage("System error. Please try again."));
  }
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
        (id, user_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .bind(
        sessionId,
        user.id,
        expiresAt
      )
      .run();

    c.header(
      "Set-Cookie",
      `session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );

    return c.redirect("/");

  } catch (error) {
    return c.html(
      loginPage("Login system error. Please try again."),
      500
    );
  }
});

/* =========================
   LOGOUT
========================= */

app.get("/logout", async (c) => {
  try {
    const sessionId = getSessionId(c);

    if (sessionId) {
      await c.env.DB
        .prepare("DELETE FROM sessions WHERE id = ?")
        .bind(sessionId)
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
   ADMIN DASHBOARD
========================= */

app.get("/admin", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.redirect("/");
  }

  if (user.role !== "admin") {
    return c.text("Forbidden", 403);
  }

  return c.html(adminDashboard(user));
});

/* =========================
   CURRENT USER API
========================= */

app.get("/api/me", async (c) => {
  const user = await getCurrentUser(c);

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
   HEALTH CHECK
========================= */

app.get("/health", async (c) => {
  try {
    const result = await c.env.DB
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
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
    version: "3.0.0"
  });
});

export default app;
