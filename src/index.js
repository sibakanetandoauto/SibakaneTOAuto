import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "1.1.0"
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
| TEMPORARY ADMIN SETUP
|--------------------------------------------------------------------------
| Used only to create the first administrator.
| The ADMIN_SETUP_KEY remains a Cloudflare secret and is never displayed.
*/

app.get("/admin/setup", (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sibakane T & O Auto - Admin Setup</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
    }

    .box {
      max-width: 450px;
      margin: 30px auto;
      background: #fff;
      padding: 28px;
      border-radius: 14px;
      box-shadow: 0 5px 25px rgba(0,0,0,.10);
    }

    h2 {
      margin-top: 0;
    }

    input,
    button {
      width: 100%;
      padding: 14px;
      margin-top: 12px;
      border-radius: 8px;
      font-size: 16px;
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

    button:disabled {
      opacity: .6;
    }

    #result {
      margin-top: 18px;
      padding: 12px;
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .warning {
      background: #fff3cd;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 15px;
    }
  </style>
</head>

<body>

<div class="box">

  <h2>Sibakane T & O Auto</h2>
  <h3>Initial Admin Setup</h3>

  <div class="warning">
    Temporary setup page. Use this only to create the first administrator.
  </div>

  <input
    id="setupKey"
    type="password"
    placeholder="Admin setup key"
    autocomplete="off"
  >

  <input
    id="name"
    type="text"
    placeholder="Administrator name"
    autocomplete="name"
  >

  <input
    id="email"
    type="email"
    placeholder="Administrator email"
    autocomplete="email"
  >

  <input
    id="password"
    type="password"
    placeholder="Admin password (minimum 8 characters)"
    minlength="8"
    autocomplete="new-password"
  >

  <button id="button" onclick="createAdmin()">
    Create Administrator
  </button>

  <div id="result"></div>

</div>

<script>

async function createAdmin() {

  const setupKey = document.getElementById("setupKey").value;
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const result = document.getElementById("result");
  const button = document.getElementById("button");

  if (!setupKey) {
    result.textContent = "Enter the admin setup key.";
    return;
  }

  if (!name) {
    result.textContent = "Enter the administrator name.";
    return;
  }

  if (!email) {
    result.textContent = "Enter the administrator email.";
    return;
  }

  if (password.length < 8) {
    result.textContent = "Password must be at least 8 characters.";
    return;
  }

  button.disabled = true;
  result.textContent = "Creating administrator...";

  try {

    const response = await fetch("/api/admin/setup", {
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
      result.textContent = data.error || "Setup failed.";
      button.disabled = false;
      return;
    }

    result.textContent =
      "ADMIN ACCOUNT CREATED SUCCESSFULLY.\\n\\n" +
      "Email: " + data.email + "\\n" +
      "Role: " + data.role;

    document.getElementById("setupKey").value = "";
    document.getElementById("password").value = "";

  } catch (error) {

    result.textContent = "Request failed.";
    button.disabled = false;

  }
}

</script>

</body>
</html>
  `);
});


/*
|--------------------------------------------------------------------------
| CREATE FIRST ADMIN
|--------------------------------------------------------------------------
*/

app.post("/api/admin/setup", async (c) => {

  try {

    const setupKey = c.req.header("X-Admin-Setup-Key");

    if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
      return c.json(
        {
          success: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const body = await c.req.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return c.json(
        {
          success: false,
          error: "Name, email and password are required."
        },
        400
      );
    }

    if (password.length < 8) {
      return c.json(
        {
          success: false,
          error: "Password must be at least 8 characters."
        },
        400
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Only allow initial setup when no users exist
    |--------------------------------------------------------------------------
    */

    const existing = await c.env.DB
      .prepare("SELECT COUNT(*) AS count FROM users")
      .first();

    if (existing && Number(existing.count) > 0) {
      return c.json(
        {
          success: false,
          error: "Admin setup has already been completed."
        },
        403
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PBKDF2 password hashing
    |--------------------------------------------------------------------------
    */

    const encoder = new TextEncoder();

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));

    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100000,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

    const hashBytes = new Uint8Array(derivedBits);

    const salt = Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hash = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const passwordHash = `pbkdf2$100000$${salt}$${hash}`;

    /*
    |--------------------------------------------------------------------------
    | Create ADMIN
    |--------------------------------------------------------------------------
    */

    const result = await c.env.DB
      .prepare(`
        INSERT INTO users
          (name, email, password_hash, role, active)
        VALUES
          (?, ?, ?, 'ADMIN', 1)
      `)
      .bind(name, email, passwordHash)
      .run();

    return c.json({
      success: true,
      message: "Administrator created successfully.",
      id: result.meta?.last_row_id ?? null,
      name,
      email,
      role: "ADMIN"
    });

  } catch (error) {

    return c.json(
      {
        success: false,
        error: error.message
      },
      500
    );

  }

});


export default app;/*
|--------------------------------------------------------------------------
| TEMPORARY ADMIN SETUP
|--------------------------------------------------------------------------
| Used only to create the first administrator.
| The ADMIN_SETUP_KEY remains a Cloudflare secret and is never displayed.
*/

app.get("/admin/setup", (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sibakane T & O Auto - Admin Setup</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
    }

    .box {
      max-width: 450px;
      margin: 30px auto;
      background: #fff;
      padding: 28px;
      border-radius: 14px;
      box-shadow: 0 5px 25px rgba(0,0,0,.10);
    }

    h2 {
      margin-top: 0;
    }

    input,
    button {
      width: 100%;
      padding: 14px;
      margin-top: 12px;
      border-radius: 8px;
      font-size: 16px;
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

    button:disabled {
      opacity: .6;
    }

    #result {
      margin-top: 18px;
      padding: 12px;
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .warning {
      background: #fff3cd;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 15px;
    }
  </style>
</head>

<body>

<div class="box">

  <h2>Sibakane T & O Auto</h2>
  <h3>Initial Admin Setup</h3>

  <div class="warning">
    Temporary setup page. Use this only to create the first administrator.
  </div>

  <input
    id="setupKey"
    type="password"
    placeholder="Admin setup key"
    autocomplete="off"
  >

  <input
    id="name"
    type="text"
    placeholder="Administrator name"
    autocomplete="name"
  >

  <input
    id="email"
    type="email"
    placeholder="Administrator email"
    autocomplete="email"
  >

  <input
    id="password"
    type="password"
    placeholder="Admin password (minimum 8 characters)"
    minlength="8"
    autocomplete="new-password"
  >

  <button id="button" onclick="createAdmin()">
    Create Administrator
  </button>

  <div id="result"></div>

</div>

<script>

async function createAdmin() {

  const setupKey = document.getElementById("setupKey").value;
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const result = document.getElementById("result");
  const button = document.getElementById("button");

  if (!setupKey) {
    result.textContent = "Enter the admin setup key.";
    return;
  }

  if (!name) {
    result.textContent = "Enter the administrator name.";
    return;
  }

  if (!email) {
    result.textContent = "Enter the administrator email.";
    return;
  }

  if (password.length < 8) {
    result.textContent = "Password must be at least 8 characters.";
    return;
  }

  button.disabled = true;
  result.textContent = "Creating administrator...";

  try {

    const response = await fetch("/api/admin/setup", {
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
      result.textContent = data.error || "Setup failed.";
      button.disabled = false;
      return;
    }

    result.textContent =
      "ADMIN ACCOUNT CREATED SUCCESSFULLY.\\n\\n" +
      "Email: " + data.email + "\\n" +
      "Role: " + data.role;

    document.getElementById("setupKey").value = "";
    document.getElementById("password").value = "";

  } catch (error) {

    result.textContent = "Request failed.";
    button.disabled = false;

  }
}

</script>

</body>
</html>
  `);
});


/*
|--------------------------------------------------------------------------
| CREATE FIRST ADMIN
|--------------------------------------------------------------------------
*/

app.post("/api/admin/setup", async (c) => {

  try {

    const setupKey = c.req.header("X-Admin-Setup-Key");

    if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
      return c.json(
        {
          success: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const body = await c.req.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return c.json(
        {
          success: false,
          error: "Name, email and password are required."
        },
        400
      );
    }

    if (password.length < 8) {
      return c.json(
        {
          success: false,
          error: "Password must be at least 8 characters."
        },
        400
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Only allow initial setup when no users exist
    |--------------------------------------------------------------------------
    */

    const existing = await c.env.DB
      .prepare("SELECT COUNT(*) AS count FROM users")
      .first();

    if (existing && Number(existing.count) > 0) {
      return c.json(
        {
          success: false,
          error: "Admin setup has already been completed."
        },
        403
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PBKDF2 password hashing
    |--------------------------------------------------------------------------
    */

    const encoder = new TextEncoder();

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));

    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100000,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

    const hashBytes = new Uint8Array(derivedBits);

    const salt = Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hash = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const passwordHash = `pbkdf2$100000$${salt}$${hash}`;

    /*
    |--------------------------------------------------------------------------
    | Create ADMIN
    |--------------------------------------------------------------------------
    */

    const result = await c.env.DB
      .prepare(`
        INSERT INTO users
          (name, email, password_hash, role, active)
        VALUES
          (?, ?, ?, 'ADMIN', 1)
      `)
      .bind(name, email, passwordHash)
      .run();

    return c.json({
      success: true,
      message: "Administrator created successfully.",
      id: result.meta?.last_row_id ?? null,
      name,
      email,
      role: "ADMIN"
    });

  } catch (error) {

    return c.json(
      {
        success: false,
        error: error.message
      },
      500
    );

  }

});


export default app;      <title>Sibakane T & O Auto - Admin Setup</title>
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
