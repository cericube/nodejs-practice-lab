import { prisma } from '../lib/prisma.js';
import { connectRedis, disconnectRedis } from '../lib/redis.js';
import { PostService } from '../service/post.service.js';

async function main() {
  await prisma.post.deleteMany();

  const redis = await connectRedis();
  await redis.flushDb();

  const postService = new PostService();

  await postService.createPost({
    title: 'Redis String 실습',
    content: '게시글 상세 정보를 Redis String으로 캐싱하는 예제입니다.',
    author: 'kim',
    status: 'PUBLISHED',
  });

  await postService.createPost({
    title: 'Redis Hash 실습',
    content: '게시글 요약 정보를 Redis Hash로 저장하는 예제입니다.',
    author: 'kim',
    status: 'PUBLISHED',
  });

  await postService.createPost({
    title: 'Redis Sorted Set 실습',
    content: '인기 게시글 랭킹을 Redis Sorted Set으로 구현하는 예제입니다.',
    author: 'kim',
    status: 'DRAFT',
  });

  const posts = await postService.getPosts();

  console.log('Seed posts:');
  console.table(
    posts.map((post) => ({
      id: post.id,
      title: post.title,
      author: post.author,
      status: post.status,
      viewCount: post.viewCount,
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });
