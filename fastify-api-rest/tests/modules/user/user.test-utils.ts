import { prisma } from '../setup';

export async function cleanupUserTestData() {
  await prisma.postViewStat.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.reply.deleteMany();
  await prisma.postFile.deleteMany();
  await prisma.post.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}
