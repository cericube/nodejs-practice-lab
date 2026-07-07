// src/services/online-user-set.service.ts

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * 사용자 온라인 상태 변경 후 반환하는 상태 데이터입니다.
 *
 * onlineUserCount는 Redis Set 기준으로 계산한 현재 온라인 사용자 수입니다.
 */
export type OnlineUserStatusOutput = {
  userId: number;
  online: boolean;
  onlineUserCount: number;
};

/**
 * 온라인 사용자 Set의 현재 상태를 요약한 응답 데이터입니다.
 *
 * onlineUserIds는 Redis Set에 저장된 userId 문자열을 number로 변환한 목록입니다.
 */
export type OnlineUserSummaryOutput = {
  onlineUserCount: number;
  onlineUserIds: number[];
};

export class OnlineUserSetService {
  /**
   * 온라인 상태를 기록할 사용자가 DB에 존재하는지 확인합니다.
   *
   * 1. userId로 사용자 단건 조회를 실행합니다.
   * 2. 존재하지 않으면 Prisma의 findUniqueOrThrow가 예외를 발생시킵니다.
   *
   * 참고:
   * 온라인 Set에 존재하지 않는 사용자 ID가 쌓이지 않도록 쓰기 전에만 검증합니다.
   */
  private async ensureUserExists(userId: number): Promise<void> {
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * 온라인 사용자 Set에 사용자 ID를 추가합니다.
   *
   * 1. 사용자가 DB에 존재하는지 확인합니다.
   * 2. 온라인 사용자 Set key를 만듭니다.
   * 3. SADD로 userId를 Set member로 추가합니다.
   * 4. SCARD로 온라인 사용자 Set의 member 개수를 조회합니다.
   * 5. 온라인 상태와 전체 온라인 사용자 수를 반환합니다.
   *
   * 실습 포인트:
   * Redis Set은 중복 member를 허용하지 않으므로 같은 사용자가 여러 번 접속 이벤트를 보내도 한 번만 저장됩니다.
   */
  async markUserOnline(userId: number): Promise<OnlineUserStatusOutput> {
    await this.ensureUserExists(userId);

    const key = RedisKey.set.onlineUsers();

    // SADD는 이미 있는 member를 다시 추가해도 Set을 변경하지 않습니다.
    await redis.sAdd(key, String(userId));

    // SCARD 결과를 현재 온라인 사용자 수로 사용합니다.
    const onlineUserCount = await redis.sCard(key);

    return {
      userId,
      online: true,
      onlineUserCount,
    };
  }

  /**
   * 온라인 사용자 Set에서 사용자 ID를 제거합니다.
   *
   * 1. 온라인 사용자 Set key를 만듭니다.
   * 2. SREM으로 userId member를 제거합니다.
   * 3. SCARD로 제거 후 온라인 사용자 수를 조회합니다.
   * 4. 오프라인 상태와 전체 온라인 사용자 수를 반환합니다.
   *
   * 실습 포인트:
   * SREM은 member가 없어도 에러를 발생시키지 않으므로 중복 로그아웃 이벤트를 단순하게 처리할 수 있습니다.
   */
  async markUserOffline(userId: number): Promise<OnlineUserStatusOutput> {
    const key = RedisKey.set.onlineUsers();

    // SREM은 member가 없어도 실패하지 않고 제거 건수 0으로 처리합니다.
    await redis.sRem(key, String(userId));

    // 제거 후 남은 member 수를 다시 조회해 온라인 사용자 수를 맞춥니다.
    const onlineUserCount = await redis.sCard(key);

    return {
      userId,
      online: false,
      onlineUserCount,
    };
  }

  /**
   * 특정 사용자가 온라인 사용자 Set에 포함되어 있는지 확인합니다.
   *
   * 1. 온라인 사용자 Set key를 만듭니다.
   * 2. SISMEMBER로 userId가 Set에 포함되어 있는지 확인합니다.
   * 3. Redis의 응답을 boolean 값으로 변환합니다.
   *
   * 실습 포인트:
   * SISMEMBER는 Set 안에 특정 member가 존재하는지 빠르게 확인할 때 사용합니다.
   */
  async isUserOnline(userId: number): Promise<boolean> {
    const key = RedisKey.set.onlineUsers();

    // redis@6의 SISMEMBER 래퍼는 1 또는 0을 반환하므로 boolean으로 변환합니다.
    const result = await redis.sIsMember(key, String(userId));
    return result == 1;
  }

  /**
   * 온라인 사용자 Set의 member 개수를 조회합니다.
   *
   * 1. 온라인 사용자 Set key를 만듭니다.
   * 2. SCARD로 Set의 member 개수를 조회합니다.
   *
   * 실습 포인트:
   * 온라인 사용자를 Set으로 관리하면 중복 접속 이벤트가 있어도 사용자 수를 중복 없이 셀 수 있습니다.
   */
  async getOnlineUserCount(): Promise<number> {
    const key = RedisKey.set.onlineUsers();

    // key가 없으면 SCARD는 0을 반환합니다.
    return redis.sCard(key);
  }

  /**
   * 현재 온라인 사용자 수와 사용자 ID 목록을 함께 조회합니다.
   *
   * 1. 온라인 사용자 Set key를 만듭니다.
   * 2. SMEMBERS로 Set의 모든 userId member를 조회합니다.
   * 3. 문자열 userId를 number로 변환합니다.
   * 4. 온라인 사용자 수와 사용자 ID 목록을 함께 반환합니다.
   *
   * 실습 포인트:
   * SMEMBERS는 Set에 저장된 전체 member를 확인할 수 있어 온라인 사용자 목록 실습에 적합합니다.
   *
   * 참고:
   * 접속자가 많은 서비스에서는 운영 API에서 SMEMBERS 대신 SSCAN 같은 점진 조회 방식이나 별도 조회 구조를 고려해야 합니다.
   */
  async getOnlineUserSummary(): Promise<OnlineUserSummaryOutput> {
    const key = RedisKey.set.onlineUsers();

    // Redis Set은 순서를 보장하지 않으므로 members의 반환 순서도 고정되지 않습니다.
    const members = await redis.sMembers(key);
    const onlineUserIds = members.map(Number);

    return {
      onlineUserCount: onlineUserIds.length,
      onlineUserIds,
    };
  }

  /**
   * 온라인 사용자 Set을 삭제해 상태를 초기화합니다.
   *
   * 1. 온라인 사용자 Set key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하므로 온라인 사용자 member가 모두 사라집니다.
   *
   * 참고:
   * 테스트 코드나 서버 재시작 후 상태 초기화에 사용할 수 있습니다.
   */
  async clearOnlineUsers(): Promise<void> {
    const key = RedisKey.set.onlineUsers();

    // DEL은 key가 없어도 에러 없이 0건 삭제로 처리합니다.
    await redis.del(key);
  }
}
