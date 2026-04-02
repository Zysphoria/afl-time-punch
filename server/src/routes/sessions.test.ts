import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDb } from '../db.js';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDb();
});

describe('POST /api/sessions (clock in)', () => {
  it('creates a new active session', async () => {
    const res = await request(app).post('/api/sessions').send();
    expect(res.status).toBe(201);
    expect(res.body.clock_out).toBeNull();
    expect(res.body.pauses).toEqual([]);
    expect(res.body.id).toBeDefined();
  });

  it('rejects a second clock-in when one is active', async () => {
    await request(app).post('/api/sessions').send();
    const res = await request(app).post('/api/sessions').send();
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/sessions/:id — clock out', () => {
  it('closes the session and computes duration', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;
    const clockOut = new Date(Date.now() + 3600_000).toISOString();

    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ clock_out: clockOut });

    expect(res.status).toBe(200);
    expect(res.body.clock_out).toBe(clockOut);
    expect(res.body.duration_secs).toBeGreaterThan(0);
  });
});

describe('PATCH /api/sessions/:id — pause/resume', () => {
  it('opens and closes a pause with a comment', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const pauseStart = new Date(Date.now() + 1000).toISOString();
    await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ pause_start: pauseStart });

    const pauseEnd = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ pause_end: pauseEnd, comment: 'Lunch' });

    expect(res.status).toBe(200);
    expect(res.body.pauses[0].comment).toBe('Lunch');
    expect(res.body.pauses[0].end).toBe(pauseEnd);
  });
});

describe('PATCH /api/sessions/:id — manual edit', () => {
  it('updates clock_in and recalculates duration', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const newIn = new Date(Date.now() - 7200_000).toISOString();
    const newOut = new Date(Date.now() - 3600_000).toISOString();

    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ clock_in: newIn, clock_out: newOut });

    expect(res.status).toBe(200);
    expect(res.body.clock_in).toBe(newIn);
    expect(res.body.duration_secs).toBeCloseTo(3600, -2);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes an existing session', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const res = await request(app).delete(`/api/sessions/${id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/sessions');
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for a non-existent session', async () => {
    const res = await request(app).delete('/api/sessions/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions?week filter', () => {
  it('filters sessions to the given week', async () => {
    // Create a session — it will use today's date
    await request(app).post('/api/sessions').send();
    const allRes = await request(app).get('/api/sessions');
    expect(allRes.body.length).toBeGreaterThan(0);

    // Query for a past week with no data
    const pastWeek = '2020-01-06'; // A Monday far in the past
    const res = await request(app).get(`/api/sessions?week=${pastWeek}`);
    expect(res.body).toHaveLength(0);
  });
});
