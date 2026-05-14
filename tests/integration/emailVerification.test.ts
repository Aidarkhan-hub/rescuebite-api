// Один jest.mock вверху — до всех импортов
jest.mock('../../src/config/queue', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueuePasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  enqueueReservationConfirmation: jest.fn().mockResolvedValue(undefined),
  enqueuePickupReminder: jest.fn().mockResolvedValue(undefined),
  emailQueue: { add: jest.fn().mockResolvedValue({ id: 'mock-job' }) },
  startEmailWorker: jest.fn(),
}));

import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/prisma';

describe('Email Verification Integration', () => {
  const ts = Date.now();
  const email = `verify${ts}@test.com`;
  const password = 'Test1234!';

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('POST /auth/register → 201, нет токенов в ответе', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Verify User', password });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toBeUndefined();
    expect(res.body.data.message).toMatch(/verify|check your email/i);
  });

  it('POST /auth/login до верификации → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/verify/i);
  });

  it('GET /auth/verify-email с невалидным токеном → 400', async () => {
    const res = await request(app)
      .get('/api/v1/auth/verify-email?token=totallyinvalidtoken');
    expect(res.status).toBe(400);
  });

  it('GET /auth/verify-email с валидным токеном → 200', async () => {
    // Читаем RAW хеш из БД — это и есть "токен" который нужно передать
    // НО: в auth.service.ts мы храним bcrypt-хеш, а не сам токен
    // Поэтому для теста — напрямую обновим пользователя с известным токеном
    const knownToken = 'test-plain-token-123';
    const bcrypt = require('bcrypt');
    const tokenHash = await bcrypt.hash(knownToken, 10);

    await prisma.user.updateMany({
      where: { email },
      data: { emailVerificationToken: tokenHash },
    });

    const res = await request(app)
      .get(`/api/v1/auth/verify-email?token=${knownToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('токен обнуляется в БД после верификации', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.emailVerificationToken).toBeNull();
    expect(user!.isEmailVerified).toBe(true);
  });

  it('GET /auth/verify-email повторно → 400', async () => {
    const res = await request(app)
      .get('/api/v1/auth/verify-email?token=anytoken');
    expect(res.status).toBe(400);
  });

  it('POST /auth/login после верификации → 200 с токенами', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
  });
});