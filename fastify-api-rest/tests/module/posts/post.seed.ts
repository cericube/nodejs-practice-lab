import { prisma } from '../setup';

type SeedPostOption = {
  count?: number;
  publishedRatio?: number; // 0 ~ 1
};

export async function seedUsers() {
  const users = [];

  // user 2명 으로 고정
  for (let i = 1; i <= 2; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i}@test.com`,
        phoneNumber: `+82101${i}345678`,
        displayName: `User ${i}`,
      },
    });
    users.push(user);
  }

  return users;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// users: { id: number }[]: id는 반드시 있어야 한다
export async function seedPosts(users: { id: number }[], option: SeedPostOption = {}) {
  const { count = 30, publishedRatio = 0.5 } = option;

  const posts = [];

  const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
  const ONE_HOUR = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const user = users[i % users.length];
    const createdAt = new Date(baseTime + i * ONE_HOUR);

    const published = Math.random() < publishedRatio;
    const saltTitle = Math.random() < publishedRatio ? '수학' : '국어';
    const saltContent = Math.random() < publishedRatio ? '수학' : '국어';

    const post = await prisma.post.create({
      data: {
        authorId: user.id,
        title: `Post ${saltTitle}${i}`,
        content: `Content${saltContent} tree??${i}`,
        createdAt: createdAt,
        published,
        publishedAt: published ? createdAt : null,
        viewCount: randomPick([50, 50, 60, 80, 100, 120]),
        likeCount: randomPick([5, 10, 15, 20, 20]),
        replyCount: randomPick([1, 2, 3, 3, 4, 8]),
      },
    });

    posts.push(post);
  }

  return posts;
}
