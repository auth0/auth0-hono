import { serve } from '@hono/node-server';
import app from './app.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
