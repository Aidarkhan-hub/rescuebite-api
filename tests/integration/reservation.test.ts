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
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';

async function createVerifiedUser(email: string, role: Role) {
  const passwordHash = await bcrypt.hash('Test1234!', 10);
  return prisma.user.create({
    data: { email, name: 'Test', passwordHash, role, isEmailVerified: true, isActive: true },
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Test1234!' });
  return res.body.data.tokens.accessToken;
}

async function createBag(donorToken: string, quantity = 2) {
  const res = await request(app)
    .post('/api/v1/food')
    .set('Authorization', `Bearer ${donorToken}`)
    .send({
      title: 'Test Bag',
      originalPriceCents: 100000,
      quantity,
      pickupDeadline: '2027-12-31T21:00:00Z',
      allergens: [],
    });
  return res.body.data as { id: string };
}

describe('Reservation Integration Tests', () => {
  const ts = Date.now();
  const donorEmail  = `donor${ts}@test.com`;
  const r1Email     = `r1${ts}@test.com`;
  const r2Email     = `r2${ts}@test.com`;

  let donorToken: string;
  let r1Token: string;
  let r2Token: string;

  beforeAll(async () => {
    await createVerifiedUser(donorEmail, Role.DONOR);
    await createVerifiedUser(r1Email, Role.RECIPIENT);
    await createVerifiedUser(r2Email, Role.RECIPIENT);
    donorToken = await loginAs(donorEmail);
    r1Token    = await loginAs(r1Email);
    r2Token    = await loginAs(r2Email);
  });

  afterAll(async () => {
    const emails = [donorEmail, r1Email, r2Email];
    await prisma.reservation.deleteMany({
      where: { user: { email: { in: emails } } },
    });
    await prisma.foodBag.deleteMany({
      where: { title: { in: ['Test Bag', 'Sushi Combo'] } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it('POST /food → 201 для DONOR', async () => {
    const res = await request(app)
      .post('/api/v1/food')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        title: 'Sushi Combo',
        originalPriceCents: 250000,
        quantity: 3,
        pickupDeadline: '2027-06-30T20:00:00Z',
        allergens: ['FISH'],
      });
    expect(res.status).toBe(201);
  });

  it('POST /food/:id/reserve → 201, возвращает reservationId', async () => {
    const bag = await createBag(donorToken, 2);
    const res = await request(app)
      .post(`/api/v1/food/${bag.id}/reserve`)
      .set('Authorization', `Bearer ${r1Token}`)
      .send({ quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.reservationId).toBeDefined();
  });

  it('второй пользователь получает 409 когда quantity=1 уже занят', async () => {
    const bag = await createBag(donorToken, 1);

    await request(app)
      .post(`/api/v1/food/${bag.id}/reserve`)
      .set('Authorization', `Bearer ${r1Token}`)
      .send({ quantity: 1 });

    const second = await request(app)
      .post(`/api/v1/food/${bag.id}/reserve`)
      .set('Authorization', `Bearer ${r2Token}`)
      .send({ quantity: 1 });

    expect(second.status).toBe(409);
  });

  it('DELETE /food/reservations/:id → 200, сток восстанавливается', async () => {
    const bag = await createBag(donorToken, 1);

    const reserveRes = await request(app)
      .post(`/api/v1/food/${bag.id}/reserve`)
      .set('Authorization', `Bearer ${r1Token}`)
      .send({ quantity: 1 });

    const reservationId = reserveRes.body.data.reservationId;

    const cancelRes = await request(app)
      .delete(`/api/v1/food/reservations/${reservationId}`)
      .set('Authorization', `Bearer ${r1Token}`);

    expect(cancelRes.status).toBe(200);

    const dbBag = await prisma.foodBag.findUnique({ where: { id: bag.id } });
    expect(dbBag!.quantity).toBe(1);
  });
});