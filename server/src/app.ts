import express from 'express';
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

export default app;
