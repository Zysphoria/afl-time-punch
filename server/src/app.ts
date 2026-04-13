import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';

const app = express();

app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);
app.use('/api/import', importRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(__dirname, '../../client/dist');
  const indexHtml = path.join(clientDist, 'index.html');
  app.use(express.static(clientDist));
  // Only fall back to index.html for non-API routes
  app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(indexHtml));
}

// Global API error handler — must be last and have 4 params for Express to treat it as error middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;
