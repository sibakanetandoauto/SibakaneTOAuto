import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "2.1.0"
  });
});

app.get("/admin/create", (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sibakane T & O Auto</title>
</head>
<body>
  <h2>Sibakane T & O Auto</h2>
  <h3>Create Admin Account</h3>

  <form id="form">
    <input id="name" placeholder="Admin name" required><br><br>
    <input id="email" type="email" placeholder="Admin email" required><br><br>
    <input id="password" type="password" placeholder="Password" minlength="8" required><br><br>
    <input id="key" type="password" placeholder="ADMIN_SETUP_KEY" required><br><br>

    <button type="submit">Create Admin Account</button>
  </form>

  <p id="result"></p>

<script>
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const result = document.getElementById("result");

  try {
    const response = await fetch("/api/admin/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Setup-Key": document.getElementById("key").value
      },
      body: JSON.stringify({
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      })
    });

    const data = await response.json();

    result.textContent = data.message || data.error || "Unknown response";

  } catch (error) {
    result.textContent = "Request failed";
  }
});
</script>

</body>
</html>
  `);
});

app.post("/api/admin/create", async (c) => {
  try {
    const setupKey = c.req.header("X-Admin-Setup-Key");

    if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
      return c.json({
        success: false,
        error: "Unauthorized"
      }, 401);
    }

    const body = await c.req.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || password.length < 8) {
      return c.json({
        success: false,
        error: "Name, email and password of at least 8 characters are required."
      }, 400);
    }

    const existing = await c.env.DB
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existing) {
      return c.json({
        success: false,
        error: "A user with this email already exists."
      }, 409);
    }

    const data = new TextEncoder().encode(password);

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      data
    );

    const passwordHash = Array.from(
      new Uint8Array(hashBuffer)
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    await c.env.DB
      .prepare(`
        INSERT INTO users
        (name, email, password_hash, role, active)
        VALUES (?, ?, ?, 'admin', 1)
      `)
      .bind(name, email, passwordHash)
      .run();

    return c.json({
      success: true,
      message: "Admin account created successfully."
    });

  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default app;
