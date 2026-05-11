/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { jsx } from 'hono/jsx';
import { jsxRenderer } from 'hono/jsx-renderer';
import { OIDCEnv, attemptSilentLogin, auth0, requiresAuth } from "../../src/index.js";
console.log(`jsx: ${!!jsx}`)

const app = new Hono<OIDCEnv>();

app.use(auth0({ authRequired: false }));

app.get(
  '/*',
  jsxRenderer(({ children }) => {
    return (
      <html>
        <body>
          <div>{children}</div>
          <div>
            <h2>Available routes</h2>
            <ul>
              <li><a href="/">/</a></li>
              <li><a href="/protected">/protected</a></li>
              <li><a href="/auth/login">/auth/login</a></li>
              <li><a href="/auth/logout">/auth/logout</a></li>
            </ul>
          </div>
        </body>
      </html>
    )
  })
);

app.get("/", (c) => {
  const session = c.var.auth0?.session;
  if (!session) {
    return c.render(<p>
      You are currently not authenticated. Click <a href="/auth/login">here</a> to login.
      <br />
    </p>)
  }
  return c.render(
    <p>
      Welcome {session.user?.name ?? 'user'}!
      You are authenticated.
      Click <a href="/auth/logout">here</a> to logout.
    </p>
  );
});

app.get('/protected', attemptSilentLogin(), requiresAuth(), (c) => {
  return c.render(
    <p>
      This is a protected route.
      If you can see this text you are authenticated.
    </p>
  );
});

app.get('/protected-silent',
  attemptSilentLogin(),
  requiresAuth(),
  (c) => {
  return c.render(
    <p>
      This is a protected route.
      If you can see this text you are authenticated.
    </p>
  );
});

console.log("Server starting at http://localhost:3000");

serve({
  fetch: app.fetch,
  port: 3000,
});
