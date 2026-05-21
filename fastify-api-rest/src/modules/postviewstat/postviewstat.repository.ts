// src/modules/postviewstat/postviewstat.repository.ts
import { PrismaClient, Prisma } from '../../generated/client';

type PostViewStatClient = PrismaClient | Prisma.TransactionClient;

export enum BucketType {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
}

/**
 * 조회수 통계 버킷의 기준 시각을 UTC로 정규화합니다.
 *
 * DB의 unique key가 (postId, bucketType, bucketAt)이므로,
 * 같은 시간대의 조회 이벤트가 반드시 같은 bucketAt으로 모여야 upsert가 정상적으로 누적됩니다.
 */
export function truncateUtcDate(date: Date, bucketType: BucketType): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();

  switch (bucketType) {
    case BucketType.HOURLY:
      // 시간 단위 버킷은 해당 시간의 0분 0초로 맞춤
      // 2026-05-19T14:00:00.000Z
      return new Date(Date.UTC(year, month, day, hour, 0, 0, 0));

    case BucketType.DAILY:
      // 일 단위 버킷은 해당 날짜의 00:00 UTC로 맞춤
      // 2026-05-19T00:00:00.000Z
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

    case BucketType.MONTHLY:
      // 월 단위 버킷은 해당 월의 1일 00:00 UTC로 맞춤
      // 2026-05-01T00:00:00.000Z
      return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    default:
      throw new Error(`Unsupported bucketType: ${bucketType}`);
  }
}

export class PostViewStatRepository {
  private readonly buckets: BucketType[] = [
    BucketType.HOURLY,
    BucketType.DAILY,
    BucketType.MONTHLY,
  ];

  constructor(private readonly prisma: PostViewStatClient) {}

  /**
   * 현재 시각 기준 HOURLY/DAILY/MONTHLY 버킷 조회수를 생성하거나 1 증가시킵니다.
   *
   * Post.viewCount는 목록 정렬용 캐시이고, 이 테이블은 기간별 통계 조회용 이력입니다.
   * 게시글 상세 조회 흐름에서는 Post.viewCount 증가와 같은 트랜잭션 클라이언트를 주입해
   * 캐시 카운터와 기간별 통계의 의미가 어긋나지 않도록 사용합니다.
   */
  async createPostViewStat(postId: number): Promise<void> {
    const now = new Date();

    await Promise.all(
      this.buckets.map((bucketType) => {
        const bucketAt = truncateUtcDate(now, bucketType);

        return this.prisma.postViewStat.upsert({
          where: {
            postId_bucketType_bucketAt: {
              postId,
              bucketType,
              bucketAt,
            },
          },
          update: {
            viewCount: { increment: 1 },
          },
          create: {
            postId,
            bucketType,
            bucketAt,
            viewCount: 1,
          },
        });
      }),
    );
  }

  /**
   * 지정한 기간(startAt 이상, endAt 미만)의 조회수 합계를 반환합니다.
   *
   * startAt/endAt을 버킷 단위로 정규화해 API 사용자가 분/초 단위 시간을 넘겨도
   * 저장된 bucketAt 기준과 같은 경계로 조회되도록 합니다.
   */
  async getPostViewCountSumByBucketPeriod(params: {
    postId: number;
    bucketType: BucketType;
    startAt: Date;
    endAt: Date;
  }): Promise<number> {
    const { postId, bucketType, startAt, endAt } = params;
    const result = await this.prisma.postViewStat.aggregate({
      where: {
        postId,
        bucketType,
        bucketAt: {
          gte: truncateUtcDate(startAt, bucketType),
          lt: truncateUtcDate(endAt, bucketType),
        },
      },
      _sum: {
        viewCount: true,
      },
    });

    return result._sum.viewCount ?? 0;
  }

  /**
   * 지정한 기간에 해당하는 버킷별 조회수 목록을 시간 순서로 반환합니다.
   *
   * 차트/리포트 화면에서 그대로 사용할 수 있도록 repository 단계에서 bucketAt 오름차순을 보장합니다.
   */
  async getPostViewCountsByBucketPeriod(params: {
    postId: number;
    bucketType: BucketType;
    startAt: Date;
    endAt: Date;
  }): Promise<{ bucketAt: Date; viewCount: number }[]> {
    const { postId, bucketType, startAt, endAt } = params;

    const bucketStartAt = truncateUtcDate(startAt, bucketType);
    const bucketEndAt = truncateUtcDate(endAt, bucketType);

    const stats = await this.prisma.postViewStat.findMany({
      where: {
        postId,
        bucketType,
        bucketAt: {
          gte: bucketStartAt,
          lt: bucketEndAt,
        },
      },
      orderBy: {
        bucketAt: 'asc',
      },
      select: {
        bucketAt: true,
        viewCount: true,
      },
    });
    return stats;
  }

  /**
   * 특정 버킷 시점의 조회수 상위 게시글을 반환합니다.
   *
   * limit은 API 스키마와 별개로 repository에서도 1~100 범위로 보정해
   * 내부 호출자가 잘못된 값을 넘겨도 과도한 조회가 발생하지 않게 합니다.
   */
  async getTopViewPostListByBucket(params: {
    bucketType: BucketType;
    date: Date;
    limit: number;
  }): Promise<{ postId: number; viewCount: number }[]> {
    const { bucketType, date, limit } = params;

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const bucketStartAt = truncateUtcDate(date, bucketType);

    const stats = await this.prisma.postViewStat.findMany({
      where: {
        bucketType,
        bucketAt: bucketStartAt,
      },
      // 동률일 때도 결과 순서가 흔들리지 않도록 postId를 보조 정렬 기준으로 둡니다.
      orderBy: [{ viewCount: 'desc' }, { postId: 'asc' }],
      take: safeLimit,
      select: {
        postId: true,
        viewCount: true,
      },
    });
    return stats;
  }
}
