import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    system: "Sibakane T & O Auto",
    status: "online",
    version: "1.0.0"
  });
});

export default app;
