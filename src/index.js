import { Hono } from "hono";

const app = new Hono();

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  const hashBytes = new Uint8Array(bits);

  const toHex = (bytes) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return `pbkdf2$100000$${toHex(saltBytes)}$${toHex(hashBytes)}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";

  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return value.join("=");
    }
  }

  return null;
}

function htmlPage(title, body) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      color: #222;
    }

    .container {
      width: min(100% - 30px, 900px);
      margin: 30px auto;
    }

    .card {
      background: white;
      padding: 25px;
      border-radius: 14px;
      box-shadow: 0 4px 18px rgba(0,0,0,.08);
      margin-bottom: 20px;
    }

    input,
    button,
    select {
      width: 100%;
      padding: 13px;
      margin-top: 10px;
      border-radius: 8px;
      font-size: 16px;
    }

    input,
    select {
      border: 1px solid #ccc;
    }

    button {
      border: 0;
      background: #222;
      color: white;
      font-weight: bold;
      cursor: pointer;
    }

    a {
      color: #222;
      font-weight: bold;
    }

    .success {
      background: #e8f7e8;
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
    }

    .error {
      background: #ffe8e8;
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
  </style>
</head>

<body>
  <div class="container">
    ${body}
  </div>
</body>
</html>
`;
}

/*
|--------------------------------------------------------------------------
| Public health endpoint
|--------------------------------------------------------------------------
*/

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "2.0.0"
  });
});

app.get("/health", async (c) => {
  try {
    const result = await c.env.DB
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all();

    return c.json({
      status: "healthy",
      database: "connected",
      tables: result.results
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error.message
      },
      500
    );
  }
});

/*
|--------------------------------------------------------------------------
| INITIAL ADMIN SETUP
|--------------------------------------------------------------------------
*/

app.get("/admin/setup", async (c) => {
  const existing = await c.env.DB
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first();

  if (Number(existing?.count || 0) > 0) {
    return c.html(
      htmlPage(
        "Setup Complete",
        `
        <div class="card">
          <h2>Sibakane T & O Auto</h2>
          <h3>Admin Setup</h3>
          <p>Initial administrator setup has already been completed.</p>
          <p><a href="/login">Go to Login</a></p>
        </div>
        `
      )
    );
  }

  return c.html(
    htmlPage(
      "Admin Setup",
      `
      <div class="card">
        <h2>Sibakane T & O Auto</h2>
        <h3>Create First Administrator</h3>

        <p>
          This creates the first ADMIN account.
          The setup key is your Cloudflare secret.
        </p>

        <form method="POST" action="/admin/setup">

          <input
            name="setupKey"
            type="password"
            placeholder="ADMIN_SETUP_KEY"
            required
          >

          <input
            name="name"
            type="text"
            placeholder="Administrator name"
            required
          >

          <input
            name="email"
            type="email"
            placeholder="Administrator email"
            required
          >

          <input
            name="password"
            type="password"
            placeholder="Password - minimum 8 characters"
            minlength="8"
            required
          >

          <button type="submit">
            Create Administrator
          </button>

        </form>
      </div>
      `
    )
  );
});

app.post("/admin/setup", async (c) => {
  try {
    const existing = await c.env.DB
      .prepare("SELECT COUNT(*) AS count FROM users")
      .first();

    if (Number(existing?.count || 0) > 0) {
      return c.text("Admin setup has already been completed.", 403);
    }

    const body = await c.req.parseBody();

    const setupKey = String(body.setupKey || "");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (setupKey !== c.env.ADMIN_SETUP_KEY) {
      return c.text("Unauthorized", 401);
    }

    if (!name || !email) {
      return c.text("Name and email are required.", 400);
    }

    if (password.length < 8) {
      return c.text("Password must be at least 8 characters.", 400);
    }

    const passwordHash = await hashPassword(password);

    const result = await c.env.DB
      .prepare(`
        INSERT INTO users
        (name, email, password_hash, role, active)
        VALUES (?, ?, ?, 'ADMIN', 1)
      `)
      .bind(name, email, passwordHash)
      .run();

    return c.html(
      htmlPage(
        "Admin Created",
        `
        <div class="card">
          <h2>Administrator Created Successfully</h2>

          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> ADMIN</p>

          <p>
            <a href="/login">Continue to Login</a>
          </p>
        </div>
        `
      )
    );
  } catch (error) {
    return c.text(`Setup error: ${error.message}`, 500);
  }
});

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.get("/login", (c) => {
  return c.html(
    htmlPage(
      "Login",
      `
      <div class="card">
        <h2>Sibakane T & O Auto</h2>
        <h3>Login</h3>

        <form method="POST" action="/login">

          <input
            name="email"
            type="email"
            placeholder="Email"
            required
          >

          <input
            name="password"
            type="password"
            placeholder="Password"
            required
          >

          <button type="submit">
            Login
          </button>

        </form>
      </div>
      `
    )
  );
});

app.post("/login", async (c) => {
  try {
    const body = await c.req.parseBody();

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const user = await c.env.DB
      .prepare(`
        SELECT id, name, email, password_hash, role, active
        FROM users
        WHERE email = ?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (!user || Number(user.active) !== 1) {
      return c.text("Invalid email or password.", 401);
    }

    /*
     * For the first version, compare the stored PBKDF2 hash.
     */

    const stored = String(user.password_hash || "");

    const parts = stored.split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return c.text("Invalid password configuration.", 500);
    }

    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHash = parts[3];

    const hexToBytes = (hex) => {
      const bytes = new Uint8Array(hex.length / 2);

      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }

      return bytes;
    };

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: hexToBytes(saltHex),
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const calculatedHash = Array.from(new Uint8Array(bits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedHash !== expectedHash) {
      return c.text("Invalid email or password.", 401);
    }

    const sessionId = crypto.randomUUID();

    const expiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7
    ).toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO sessions
        (id, user_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .bind(sessionId, user.id, expiresAt)
      .run();

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/dashboard",
        "Set-Cookie":
          `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      }
    });
  } catch (error) {
    return c.text(`Login error: ${error.message}`, 500);
  }
});

/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
*/

async function getCurrentUser(c) {
  const sessionId = getCookie(c.req.raw, "session");

  if (!sessionId) {
    return null;
  }

  const result = await c.env.DB
    .prepare(`
      SELECT
        users.id,
        users.name,
        users.email,
        users.role,
        users.active,
        sessions.expires_at
      FROM sessions
      INNER JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.id = ?
      LIMIT 1
    `)
    .bind(sessionId)
    .first();

  if (!result) {
    return null;
  }

  if (Number(result.active) !== 1) {
    return null;
  }

  if (new Date(result.expires_at).getTime() < Date.now()) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();

    return null;
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

app.get("/dashboard", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.redirect("/login");
  }

  if (user.role === "ADMIN") {
    return c.redirect("/admin");
  }

  if (user.role === "HUNTER") {
    return c.redirect("/hunter");
  }

  if (user.role === "DEALERSHIP") {
    return c.redirect("/dealership");
  }

  return c.text("Unknown account role.", 403);
});

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

app.get("/admin", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.redirect("/login");
  }

  if (user.role !== "ADMIN") {
    return c.text("Forbidden", 403);
  }

  const users = await c.env.DB
    .prepare(`
      SELECT id, name, email, role, active, created_at
      FROM users
      ORDER BY id DESC
    `)
    .all();

  const leads = await c.env.DB
    .prepare(`
      SELECT *
      FROM leads
      ORDER BY id DESC
      LIMIT 50
    `)
    .all();

  return c.html(
    htmlPage(
      "Admin Dashboard",
      `
      <div class="card">
        <h2>Sibakane T & O Auto</h2>
        <h3>ADMIN Dashboard</h3>

        <p>
          Welcome, <strong>${user.name}</strong>
        </p>

        <p>
          <a href="/logout">Logout</a>
        </p>
      </div>

      <div class="card">
        <h3>Users</h3>

        <table>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Active</th>
          </tr>

          ${users.results
            .map(
              (u) => `
                <tr>
                  <td>${u.name}</td>
                  <td>${u.email}</td>
                  <td>${u.role}</td>
                  <td>${u.active}</td>
                </tr>
              `
            )
            .join("")}
        </table>
      </div>

      <div class="card">
        <h3>Recent Leads</h3>

        <table>
          <tr>
            <th>ID</th>
            <th>Status</th>
          </tr>

          ${leads.results
            .map(
              (lead) => `
                <tr>
                  <td>${lead.id ?? ""}</td>
                  <td>${lead.status ?? ""}</td>
                </tr>
              `
            )
            .join("")}
        </table>
      </div>
      `
    )
  );
});

/*
|--------------------------------------------------------------------------
| HUNTER
|--------------------------------------------------------------------------
*/

app.get("/hunter", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.redirect("/login");
  }

  if (user.role !== "HUNTER") {
    return c.text("Forbidden", 403);
  }

  return c.html(
    htmlPage(
      "Hunter Dashboard",
      `
      <div class="card">
        <h2>Lead Hunter Dashboard</h2>

        <p>
          Welcome, <strong>${user.name}</strong>
        </p>

        <p>Your assigned leads will appear here.</p>

        <p>
          <a href="/logout">Logout</a>
        </p>
      </div>
      `
    )
  );
});

/*
|--------------------------------------------------------------------------
| DEALERSHIP
|--------------------------------------------------------------------------
*/

app.get("/dealership", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.redirect("/login");
  }

  if (user.role !== "DEALERSHIP") {
    return c.text("Forbidden", 403);
  }

  return c.html(
    htmlPage(
      "Dealership Dashboard",
      `
      <div class="card">
        <h2>Dealership Dashboard</h2>

        <p>
          Welcome, <strong>${user.name}</strong>
        </p>

        <p>Your dealership leads will appear here.</p>

        <p>
          <a href="/logout">Logout</a>
        </p>
      </div>
      `
    )
  );
});

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

app.get("/logout", async (c) => {
  const sessionId = getCookie(c.req.raw, "session");

  if (sessionId) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie":
        "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
});

export default app;
