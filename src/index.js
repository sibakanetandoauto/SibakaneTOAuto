import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "1.0.3"
  });
});

app.get("/health", async (c) => {
  try {
    const result = await c.env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
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

app.get("/admin/setup", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sibakane T & O Auto - Admin Setup</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          padding: 30px;
        }
        .box {
          max-width: 420px;
          margin: 40px auto;
          background: white;
          padding: 25px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,.1);
        }
        input, button {
          width: 100%;
          box-sizing: border-box;
          padding: 14px;
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
        }
        #result {
          margin-top: 15px;
          word-break: break-word;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Sibakane T & O Auto</h2>
        <h3>Admin Password Setup</h3>

        <input
          id="password"
          type="password"
          placeholder="Enter admin password"
          minlength="8"
        >

        <button onclick="generateHash()">
          Generate Password Hash
        </button>

        <div id="result"></div>
      </div>

      <script>
        async function generateHash() {
          const password = document.getElementById("password").value;
          const result = document.getElementById("result");

          if (password.length < 8) {
            result.textContent = "Password must be at least 8 characters.";
            return;
          }

          result.textContent = "Requesting...";

          try {
            const response = await fetch("/api/admin/hash-password", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (!response.ok) {
              result.textContent = data.error || "Request failed";
              return;
            }

            result.textContent = data.passwordHash;
          } catch (error) {
            result.textContent = "Request failed";
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.post("/api/admin/hash-password", async (c) => {
  try {
    const setupKey = c.req.header("X-Admin-Setup-Key");

    if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
      return c.json({
        success: false,
        error: "Unauthorized"
      }, 401);
    }

    const body = await c.req.json();
    const password = body.password;

    if (!password || password.length < 8) {
      return c.json({
        success: false,
        error: "Password must be at least 8 characters"
      }, 400);
    }

    const data = new TextEncoder().encode(password);

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      data
    );

    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const passwordHash = hashArray
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    return c.json({
      success: true,
      passwordHash
    });

  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default app;
