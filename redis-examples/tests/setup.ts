import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { connectRedis, disconnectRedis } from '../src/lib/redis.js';

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.post.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const redis = await connectRedis();
  await redis.flushDb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await disconnectRedis();
});
