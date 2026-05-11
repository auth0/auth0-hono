import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth0, type OIDCEnv } from "../../src/index.js";

const app = new Hono<OIDCEnv>();

app.use(auth0());

app.get("/", (c) => {
  const session = c.var.auth0?.session;
  return c.text(`Hello ${session?.user?.name ?? "user"}!
    You are authenticated.`);
});

console.log("Server starting at http://localhost:3000");

serve({
  fetch: app.fetch,
  port: 3000,
});
