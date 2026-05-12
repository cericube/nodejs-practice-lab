import { prisma } from '../setup';

// ---------------------
// Utils
// ---------------------
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = <T>(arr: T[]) => [...arr].sort(() => 0.5 - Math.random());

const randomPick = <T>(arr: T[]) => arr[rand(0, arr.length - 1)];

// ✔ 전화번호 (패턴 보장)
const generatePhone = (i: number) => `+8210${String(i).padStart(8, '0')}`;

// ---------------------
// 1. Users
// ---------------------
export async function seedUsers(count = 10) {
  const users = [];

  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i + 1}_${Date.now()}@test.com`,
        phoneNumber: generatePhone(i), // ✅ 패턴 만족
        displayName: `User ${i + 1}`,
      },
    });

    users.push(user);
  }

  return users;
}

// ---------------------
// 2. Posts
// ---------------------
type SeedPostOption = {
  count?: number;
  publishedRatio?: number;
};

export async function seedPosts(users: { id: number }[], option: SeedPostOption = {}) {
  const { count = 30, publishedRatio = 0.7 } = option;

  const posts = [];

  const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
  const ONE_HOUR = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const user = randomPick(users);

    const createdAt = new Date(baseTime + i * ONE_HOUR);
    const published = Math.random() < publishedRatio;

    const topic = randomPick(['수학', '국어', '영어', '과학', '코딩']);

    const post = await prisma.post.create({
      data: {
        authorId: user.id,
        title: `${topic} Post ${i}`,
        content: `${topic} content ${i}`,
        createdAt,
        published,
        publishedAt: published ? createdAt : null,
        viewCount: randomPick([10, 50, 100, 200]),
        likeCount: 0, // 👉 PostLike에서 다시 계산됨
        replyCount: randomPick([0, 1, 2, 3, 5]),
      },
    });

    posts.push(post);
  }

  return posts;
}

// ---------------------
// 3. PostLikes
// ---------------------
type SeedPostLikeOption = {
  maxLikesPerUser?: number;
};

export async function seedPostLikes(
  users: { id: number }[],
  posts: { id: number; createdAt: Date }[],
  option: SeedPostLikeOption = {},
) {
  const { maxLikesPerUser = 10 } = option;

  const likeSet = new Set<string>();

  const likes: {
    userId: number;
    postId: number;
    createdAt: Date;
  }[] = [];

  const ONE_MINUTE = 60 * 1000;

  for (const user of users) {
    let likeCount = rand(3, maxLikesPerUser);

    // 특정 유저는 더 많은 좋아요 (테스트 강화)
    if (user.id === users[0].id) {
      likeCount = maxLikesPerUser;
    }

    const selectedPosts = shuffle(posts).slice(0, likeCount);

    selectedPosts.forEach((post, idx) => {
      const key = `${user.id}-${post.id}`;
      if (likeSet.has(key)) return;
      likeSet.add(key);

      // ✔ cursor 테스트용 timestamp 설계
      const sameBucket = idx % 4 === 0;

      const offsetMinutes = sameBucket ? Math.floor(idx / 4) : rand(0, 500);

      const createdAt = new Date(post.createdAt.getTime() + offsetMinutes * ONE_MINUTE);

      likes.push({
        userId: user.id,
        postId: post.id,
        createdAt,
      });
    });
  }

  await prisma.postLike.createMany({
    data: likes,
  });

  // ---------------------
  // likeCount sync
  // ---------------------
  const grouped = await prisma.postLike.groupBy({
    by: ['postId'],
    _count: true,
  });

  for (const row of grouped) {
    await prisma.post.update({
      where: { id: row.postId },
      data: { likeCount: row._count },
    });
  }

  return likes;
}
