import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';
import exportRouter from './routes/export.js';

const app = express();

app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(__dirname, '../../client/dist');
  const indexHtml = path.join(clientDist, 'index.html');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(indexHtml));
}

export default app;
