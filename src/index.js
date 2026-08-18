import { Hono } from "hono";

const app = new Hono();

const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 310000;

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derivedBits))}`;
}

async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
      return false;
    }

    const iterations = Number(parts[1]);

    if (!Number.isInteger(iterations) || iterations < 100000) {
      return false;
    }

    const salt = base64ToBytes(parts[2]);
    const expected = base64ToBytes(parts[3]);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      expected.length * 8
    );

    const actual = new Uint8Array(derivedBits);

    if (actual.length !== expected.length) {
      return false;
    }

    let difference = 0;

    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const cookie of cookieHeader.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

function sessionCookie(sessionId, maxAge) {
  return [
    `session=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`
  ].join("; ");
}

async function getCurrentUser(c) {
  const sessionId = getCookie(c.req.raw, "session");

  if (!sessionId) {
    return null;
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
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ?
        AND sessions.expires_at > datetime('now')
        AND users.active = 1
      LIMIT 1
    `)
    .bind(sessionId)
    .first();

  return session || null;
}

function requireRole(...roles) {
  return async (c, next) => {
    const user = await getCurrentUser(c);

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("user", user);
    await next();
  };
}
app.post("/api/admin/hash-password", async (c) => {
  const setupKey = c.req.header("X-Admin-Setup-Key");

  if (!setupKey || setupKey !== c.env.ADMIN_SETUP_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body?.password || String(body.password).length < 12) {
    return c.json({
      error: "Password must be at least 12 characters"
    }, 400);
  }

  const hash = await hashPassword(String(body.password));

  return c.json({ hash });
});
app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/health", async (c) => {
  try {
    const result = await c.env.DB
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all();

    return c.json({
      status: "healthy",
      database: "connected",
      tables: result.results
    });
  } catch {
    return c.json(
      {
        status: "error",
        database: "connection_failed"
      },
      500
    );
  }
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body?.email || !body?.password) {
    return c.json(
      { error: "Email and password are required" },
      400
    );
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);

  const user = await c.env.DB
    .prepare(`
      SELECT id, name, email, password_hash, role, active
      FROM users
      WHERE lower(email) = ?
      LIMIT 1
    `)
    .bind(email)
    .first();

  if (!user || !user.active) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const sessionId = bytesToBase64(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await c.env.DB
    .prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `)
    .bind(sessionId, user.id, expiresAt)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(
          sessionId,
          SESSION_DAYS * 24 * 60 * 60
        )
      }
    }
  );
});

app.post("/api/auth/logout", async (c) => {
  const sessionId = getCookie(c.req.raw, "session");

  if (sessionId) {
    await c.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie("", 0)
      }
    }
  );
});

app.get("/api/auth/me", async (c) => {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.json({ authenticated: false }, 401);
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

app.get(
  "/api/admin/test",
  requireRole("admin"),
  (c) => {
    return c.json({
      authorized: true,
      area: "admin"
    });
  }
);

app.get(
  "/api/hunter/test",
  requireRole("hunter"),
  (c) => {
    return c.json({
      authorized: true,
      area: "hunter"
    });
  }
);

app.get(
  "/api/dealership/test",
  requireRole("dealership"),
  (c) => {
    return c.json({
      authorized: true,
      area: "dealership"
    });
  }
);

export default app;
