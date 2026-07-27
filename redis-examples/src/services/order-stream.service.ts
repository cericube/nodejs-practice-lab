// src/services/order-stream.service.ts

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/** 주문 생성에 필요한 사용자 ID와 결제 금액을 전달하는 입력 타입입니다. */
export type CreateOrderInput = {
  userId: number;
  totalPrice: number;
};

/** Redis Stream에 기록할 수 있는 주문 이벤트의 종류입니다. */
export type OrderEventType = 'order.created' | 'order.paid' | 'order.cancelled' | 'order.shipped';

/** Redis Stream 메시지를 애플리케이션에서 사용하기 쉬운 값으로 변환한 출력 타입입니다. */
export type OrderEventOutput = {
  id: string;
  eventType: string;
  orderId: number;
  userId: number;
  status: string;
  totalPrice: number;
  createdAt: string;
};

/**
 * Redis Stream에서 조회한 주문 이벤트를 서비스 출력 형태로 변환합니다.
 *
 * 1. Stream 메시지 ID를 이벤트 ID로 사용합니다.
 * 2. 문자열로 저장된 주문 ID, 사용자 ID, 결제 금액을 number 타입으로 변환합니다.
 * 3. 나머지 메시지 필드를 주문 이벤트 출력 데이터에 매핑합니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열로 저장되므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseOrderEvent(entry: { id: string; message: Record<string, string> }): OrderEventOutput {
  return {
    id: entry.id,
    eventType: entry.message.eventType,
    orderId: Number(entry.message.orderId),
    userId: Number(entry.message.userId),
    status: entry.message.status,
    totalPrice: Number(entry.message.totalPrice),
    createdAt: entry.message.createdAt,
  };
}

export class OrderStreamService {
  /**
   * 주문을 생성하고 주문 생성 이벤트를 기록합니다.
   *
   * 1. Order 테이블에 주문을 저장합니다.
   * 2. 주문 생성 결과를 기준으로 Redis Stream에 order.created 이벤트를 기록합니다.
   * 3. 생성된 주문 정보를 반환합니다.
   *
   * 실습 포인트:
   * DB는 현재 주문 상태의 원본 저장소입니다.
   * Redis Stream은 주문 생성 사실을 다른 worker나 서비스가 나중에 처리할 수 있도록 남기는 이벤트 로그입니다.
   *
   * 참고:
   * DB 저장 후 Stream 기록에 실패할 수 있으므로 실무에서는 Outbox Pattern 등으로 두 저장소의 정합성을 보완할 수 있습니다.
   */
  async createOrder(input: CreateOrderInput) {
    const order = await prisma.order.create({
      data: {
        userId: input.userId,
        totalPrice: input.totalPrice,
        status: 'CREATED',
      },
    });

    await this.addOrderEvent({
      eventType: 'order.created',
      orderId: order.id,
      userId: order.userId,
      status: order.status,
      totalPrice: order.totalPrice,
    });

    return order;
  }

  /**
   * 주문 이벤트를 Redis Stream에 추가합니다.
   *
   * 1. Redis Stream key를 가져옵니다.
   * 2. XADD 명령으로 주문 이벤트를 추가합니다.
   * 3. '*'를 사용하면 Redis가 Stream 메시지 ID를 자동 생성합니다.
   *
   * 실습 포인트:
   * Stream 메시지는 명시적으로 삭제하거나 보존 길이를 제한하지 않는 한 Redis에 로그처럼 남습니다.
   * 따라서 나중에 XRANGE로 다시 조회하거나 Consumer Group으로 처리할 수 있습니다.
   */
  async addOrderEvent(input: {
    eventType: OrderEventType;
    orderId: number;
    userId: number;
    status: string;
    totalPrice: number;
  }): Promise<string> {
    const key = RedisKey.stream.orders();

    // 주문 이벤트을 Stream에 저장합니다.
    // 이벤트를 추가하고 생성된 메시지 ID를 반환합니다.
    const messageId = await redis.xAdd(key, '*', {
      eventType: input.eventType,
      orderId: String(input.orderId),
      userId: String(input.userId),
      status: input.status,
      totalPrice: String(input.totalPrice),
      createdAt: new Date().toISOString(),
    });

    return messageId;
  }

  /**
   * Redis Stream에 기록된 주문 이벤트 목록을 조회합니다.
   *
   * 1. Stream의 처음부터 끝까지 이벤트를 조회합니다.
   * 2. COUNT 옵션으로 반환할 최대 메시지 수를 제한합니다.
   * 3. 각 메시지의 문자열 필드를 서비스 출력 타입으로 변환합니다.
   *
   * 실습 포인트:
   * Pub/Sub과 달리 Stream은 이미 발행된 이벤트도 다시 조회할 수 있습니다.
   *
   * 참고:
   * XRANGE는 오래된 메시지부터 조회하므로 count는 최근 이벤트 수가 아니라 처음부터 조회할 최대 개수를 의미합니다.
   */
  async getOrderEvents(count = 10): Promise<OrderEventOutput[]> {
    const key = RedisKey.stream.orders();

    // 주문 이벤트 이력을 오래된 순서로 조회합니다.
    // COUNT 옵션으로 최대 조회 수를 제한하며, 이벤트가 없으면 빈 배열을 반환합니다.
    const entries = await redis.xRange(key, '-', '+', {
      COUNT: count,
    });

    return entries.map(parseOrderEvent);
  }

  /**
   * 주문 상태를 변경하고 상태 변경 이벤트를 기록합니다.
   *
   * 1. DB에서 지정한 주문의 상태를 수정합니다.
   * 2. 변경된 상태에 대응하는 이벤트 종류를 결정합니다.
   * 3. 수정된 주문 정보를 Redis Stream에 기록합니다.
   *
   * 실습 포인트:
   * DB에는 현재 상태를 저장하고 Stream에는 상태가 변경된 이력을 순서대로 남깁니다.
   *
   * 참고:
   * 정의되지 않은 상태는 order.created로 기록되므로 실무에서는 허용 상태를 검증하거나 상태 타입을 제한해야 합니다.
   */
  async changeOrderStatus(orderId: number, status: string): Promise<void> {
    const order = await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status,
      },
    });

    const eventType: OrderEventType =
      status === 'PAID'
        ? 'order.paid'
        : status === 'CANCELLED'
          ? 'order.cancelled'
          : status === 'SHIPPED'
            ? 'order.shipped'
            : 'order.created';

    await this.addOrderEvent({
      eventType,
      orderId: order.id,
      userId: order.userId,
      status: order.status,
      totalPrice: order.totalPrice,
    });
  }
}
