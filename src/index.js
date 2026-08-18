import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "1.0.1"
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
  } catch (error) {
    return c.json({
      status: "error",
      database: "connection_failed"
    }, 500);
  }
});

export default app;
