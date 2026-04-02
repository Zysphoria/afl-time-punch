import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDb } from '../db.js';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDb();
});

describe('GET /api/settings', () => {
  it('returns the default hourly rate', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.hourly_rate).toBe('15.00');
  });
});

describe('PUT /api/settings', () => {
  it('updates the hourly rate', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ hourly_rate: '25.00' });
    expect(res.status).toBe(200);
    expect(res.body.hourly_rate).toBe('25.00');

    const check = await request(app).get('/api/settings');
    expect(check.body.hourly_rate).toBe('25.00');
  });

  it('rejects an invalid hourly rate', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ hourly_rate: 'abc' });
    expect(res.status).toBe(400);
  });
});
