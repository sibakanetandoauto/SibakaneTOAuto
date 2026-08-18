import { Hono } from "hono";

const app = new Hono();

const json = (c, data, status = 200) =>
  c.json(data, status);

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function createSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* =========================
   PUBLIC
========================= */

app.get("/", (c) => {
  return json(c, {
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

    return json(c, {
      status: "healthy",
      database: "connected",
      tables: result.results
    });
  } catch (error) {
    return json(c, {
      status: "error",
      message: error.message
    }, 500);
  }
});

/* =========================
   ADMIN INITIAL SETUP
========================= */

app.post("/api/admin/create", async (c) => {
  try {
    const setupKey = c.req.header("X-Admin-Setup-Key");

    if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
      return json(c, {
        success: false,
        error: "Unauthorized"
      }, 401);
    }

    const body = await c.req.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || password.length < 8) {
      return json(c, {
        success: false,
        error: "Name, email and password of at least 8 characters are required."
      }, 400);
    }

    const existing = await c.env.DB
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existing) {
      return json(c, {
        success: false,
        error: "A user with this email already exists."
      }, 409);
    }

    const passwordHash = await hashPassword(password);

    await c.env.DB
      .prepare(`
        INSERT INTO users
        (name, email, password_hash, role, active)
        VALUES (?, ?, ?, 'admin', 1)
      `)
      .bind(name, email, passwordHash)
      .run();

    return json(c, {
      success: true,
      message: "Admin account created successfully."
    });

  } catch (error) {
    return json(c, {
      success: false,
      error: error.message
    }, 500);
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", async (c) => {
  try {
    const body = await c.req.json();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || "");

    if (!email || !password) {
      return json(c, {
        success: false,
        error: "Email and password are required."
      }, 400);
    }

    const user = await c.env.DB
      .prepare(`
        SELECT id, name, email, password_hash, role, active
        FROM users
        WHERE email = ?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (!user || user.active !== 1) {
      return json(c, {
        success: false,
        error: "Invalid email or password."
      }, 401);
    }

    const passwordHash = await hashPassword(password);

    if (passwordHash !== user.password_hash) {
      return json(c, {
        success: false,
        error: "Invalid email or password."
      }, 401);
    }

    const sessionId = createSessionId();

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

    return json(c, {
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      session: sessionId
    });

  } catch (error) {
    return json(c, {
      success: false,
      error: error.message
    }, 500);
  }
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/auth/me", async (c) => {
  try {
    const sessionId = c.req.header("Authorization")?.replace(
      "Bearer ",
      ""
    );

    if (!sessionId) {
      return json(c, {
        success: false,
        error: "Not authenticated."
      }, 401);
    }

    const session = await c.env.DB
      .prepare(`
        SELECT
          sessions.id,
          sessions.expires_at,
          users.id AS user_id,
          users.name,
          users.email,
          users.role,
          users.active
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ?
        LIMIT 1
      `)
      .bind(sessionId)
      .first();

    if (!session) {
      return json(c, {
        success: false,
        error: "Invalid session."
      }, 401);
    }

    if (new Date(session.expires_at) < new Date()) {
      await c.env.DB
        .prepare("DELETE FROM sessions WHERE id = ?")
        .bind(sessionId)
        .run();

      return json(c, {
        success: false,
        error: "Session expired."
      }, 401);
    }

    if (session.active !== 1) {
      return json(c, {
        success: false,
        error: "Account disabled."
      }, 403);
    }

    return json(c, {
      success: true,
      user: {
        id: session.user_id,
        name: session.name,
        email: session.email,
        role: session.role
      }
    });

  } catch (error) {
    return json(c, {
      success: false,
      error: error.message
    }, 500);
  }
});

/* =========================
   LOGOUT
========================= */

app.post("/api/auth/logout", async (c) => {
  try {
    const sessionId = c.req.header("Authorization")?.replace(
      "Bearer ",
      ""
    );

    if (sessionId) {
      await c.env.DB
        .prepare("DELETE FROM sessions WHERE id = ?")
        .bind(sessionId)
        .run();
    }

    return json(c, {
      success: true,
      message: "Logged out."
    });

  } catch (error) {
    return json(c, {
      success: false,
      error: error.message
    }, 500);
  }
});

export default app; });
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
app.get("/admin/create", (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sibakane T & O Auto - Admin Setup</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f4f4f4;
      padding: 20px;
    }

    .box {
      max-width: 420px;
      margin: 30px auto;
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,.1);
    }

    input, button {
      width: 100%;
      box-sizing: border-box;
      padding: 13px;
      margin-top: 10px;
      border-radius: 8px;
    }

    input {
      border: 1px solid #ccc;
    }

    button {
      border: 0;
      background: #222;
      color: white;
      font-weight: bold;
      cursor: pointer;
    }

    #result {
      margin-top: 15px;
      padding: 10px;
      word-break: break-word;
    }
  </style>
</head>

<body>

<div class="box">

  <h2>Sibakane T & O Auto</h2>
  <h3>Create Admin Account</h3>

  <input id="name" placeholder="Admin name">

  <input id="email" type="email" placeholder="Admin email">

  <input id="password" type="password"
         placeholder="Admin password"
         minlength="8">

  <input id="setupKey" type="password"
         placeholder="ADMIN_SETUP_KEY">

  <button onclick="createAdmin()">
    Create Admin Account
  </button>

  <div id="result"></div>

</div>

<script>
async function createAdmin() {

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const setupKey = document.getElementById("setupKey").value;
  const result = document.getElementById("result");

  if (!name || !email || password.length < 8 || !setupKey) {
    result.textContent =
      "Please complete all fields. Password must be at least 8 characters.";
    return;
  }

  result.textContent = "Creating admin account...";

  try {

    const response = await fetch("/api/admin/create", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "X-Admin-Setup-Key": setupKey
      },

      body: JSON.stringify({
        name,
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      result.textContent = data.error || "Unable to create account.";
      return;
    }

    result.textContent =
      "✅ Admin account created successfully. You can now log in.";

    document.getElementById("password").value = "";
    document.getElementById("setupKey").value = "";

  } catch (error) {

    result.textContent =
      "Request failed. Please try again.";

  }
}
</script>

</body>
</html>
  `);
});
export default app;
