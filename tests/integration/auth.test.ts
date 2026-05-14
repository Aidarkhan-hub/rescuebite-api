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
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

describe('Auth Integration Tests', () => {
  const ts = Date.now();
  const testUser = {
    name: 'Test User',
    email: `test${ts}@test.com`,
    password: 'Test1234!',
    role: 'RECIPIENT',
  };

  let accessToken: string;
  let refreshToken: string;

  // register больше не возвращает токены — создаём verified user напрямую в БД
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    await prisma.user.create({
      data: {
        email: testUser.email,
        name: testUser.name,
        passwordHash,
        role: Role.RECIPIENT,
        isEmailVerified: true,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.$disconnect();
  });

  it('POST /auth/register → 201, нет токенов (email verification required)', async () => {
    const newEmail = `reg${ts}@test.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...testUser, email: newEmail });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toBeUndefined(); // токены не выдаются до верификации
    expect(res.body.data.message).toMatch(/verify|check your email/i);

    await prisma.user.deleteMany({ where: { email: newEmail } });
  });

  it('POST /auth/login → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    accessToken  = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('GET /auth/me → 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(testUser.email);
  });

  it('GET /auth/me → 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /auth/login wrong password → 401', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: `fresh${Date.now()}@test.com`, password: 'WrongPass1!' });
  expect(res.status).toBe(401);
});

  it('POST /food → 403 for RECIPIENT', async () => {
    const res = await request(app)
      .post('/api/v1/food')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Test Bag',
        originalPriceCents: 35000,
        quantity: 1,
        pickupDeadline: '2027-12-31T21:00:00Z',
        allergens: ['GLUTEN'],
      });
    expect(res.status).toBe(403);
  });

  it('POST /auth/refresh → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('POST /auth/logout → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});