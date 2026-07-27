import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { OrderStreamService } from '../../src/services/order-stream.service.js';
import '../setup.js';

async function createUser() {
  return prisma.user.create({
    data: {
      email: `order-stream-${Date.now()}-${Math.random()}@example.com`,
      name: 'Order Stream User',
    },
  });
}

describe('OrderStreamService', () => {
  const service = new OrderStreamService();

  it('주문을 DB에 생성하고 order.created 이벤트를 기록한다', async () => {
    const user = await createUser();
    const order = await service.createOrder({ userId: user.id, totalPrice: 12000 });
    const events = await service.getOrderEvents();

    expect(order).toMatchObject({
      userId: user.id,
      totalPrice: 12000,
      status: 'CREATED',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'order.created',
      orderId: order.id,
      userId: user.id,
      status: 'CREATED',
      totalPrice: 12000,
    });
    expect(events[0].id).toEqual(expect.any(String));
    expect(events[0].createdAt).toEqual(expect.any(String));
  });

  it('직접 추가한 이벤트를 오래된 순서로 제한해서 조회한다', async () => {
    await service.addOrderEvent({
      eventType: 'order.paid',
      orderId: 1,
      userId: 2,
      status: 'PAID',
      totalPrice: 3000,
    });
    await service.addOrderEvent({
      eventType: 'order.shipped',
      orderId: 1,
      userId: 2,
      status: 'SHIPPED',
      totalPrice: 3000,
    });

    const events = await service.getOrderEvents(1);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'order.paid',
      orderId: 1,
      userId: 2,
      totalPrice: 3000,
    });
  });

  it('주문 상태를 변경하고 대응하는 상태 이벤트를 기록한다', async () => {
    const user = await createUser();
    const order = await service.createOrder({ userId: user.id, totalPrice: 5000 });

    await service.changeOrderStatus(order.id, 'PAID');

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const events = await service.getOrderEvents();
    expect(updated.status).toBe('PAID');
    expect(events.at(-1)).toMatchObject({
      eventType: 'order.paid',
      orderId: order.id,
      status: 'PAID',
    });
  });
});
