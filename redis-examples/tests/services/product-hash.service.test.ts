import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { ProductHashService } from '../../src/services/product-hash.service.js';
import '../setup.js';

async function createProduct() {
  return prisma.product.create({
    data: {
      name: 'Hash Product',
      stock: 100,
      status: 'ON_SALE',
    },
  });
}

describe('ProductHashService', () => {
  const productHashService = new ProductHashService();

  it('상품을 생성하고 재고 상태를 Redis Hash에 저장한다', async () => {
    const product = await productHashService.createProduct({
      name: 'Created Hash Product',
      stock: 50,
    });
    const key = RedisKey.hash.productStock(product.productId);

    expect(product).toMatchObject({
      name: 'Created Hash Product',
      stock: 50,
      reservedStock: 0,
      availableStock: 50,
      status: 'ON_SALE',
    });

    const hash = await redis.hGetAll(key);
    expect(hash).toMatchObject({
      productId: String(product.productId),
      name: 'Created Hash Product',
      stock: '50',
      reservedStock: '0',
      availableStock: '50',
      status: 'ON_SALE',
    });
  });

  it('캐시가 없으면 DB에서 상품 재고를 조회한 뒤 Redis Hash에 저장한다', async () => {
    const product = await createProduct();
    const key = RedisKey.hash.productStock(product.id);

    await expect(redis.exists(key)).resolves.toBe(0);

    const stock = await productHashService.getProductStock(product.id);

    expect(stock).toMatchObject({
      productId: product.id,
      name: 'Hash Product',
      stock: 100,
      reservedStock: 0,
      availableStock: 100,
    });
    await expect(redis.exists(key)).resolves.toBe(1);
  });

  it('Redis Hash에 캐시가 있으면 캐시 값을 반환한다', async () => {
    const product = await createProduct();
    const dbStock = await productHashService.getProductStockFromDatabase(product.id);

    await productHashService.saveProductStockToHash({
      ...dbStock,
      reservedStock: 20,
      availableStock: 80,
    });

    const stock = await productHashService.getProductStock(product.id);

    expect(stock.reservedStock).toBe(20);
    expect(stock.availableStock).toBe(80);
  });

  it('예약 재고를 증가시키고 가용 재고를 다시 계산한다', async () => {
    const product = await createProduct();

    const stock = await productHashService.increaseReservedStock(product.id, 15);
    const hash = await redis.hGetAll(RedisKey.hash.productStock(product.id));

    expect(stock).toMatchObject({
      stock: 100,
      reservedStock: 15,
      availableStock: 85,
    });
    expect(hash).toMatchObject({
      reservedStock: '15',
      availableStock: '85',
    });
  });

  it('예약 재고를 감소시키되 0보다 작아지지 않게 보정한다', async () => {
    const product = await createProduct();

    await productHashService.increaseReservedStock(product.id, 10);
    const stock = await productHashService.decreaseReservedStock(product.id, 30);

    expect(stock.reservedStock).toBe(0);
    expect(stock.availableStock).toBe(100);
  });

  it('DB 상품 재고를 수정하고 Redis Hash를 최신 값으로 갱신한다', async () => {
    const product = await createProduct();

    const updated = await productHashService.updateProductStock(product.id, {
      stock: 80,
      reservedStock: 5,
      status: 'SOLD_OUT',
    });
    const hash = await redis.hGetAll(RedisKey.hash.productStock(product.id));

    expect(updated).toMatchObject({
      productId: product.id,
      stock: 80,
      reservedStock: 5,
      availableStock: 75,
      status: 'SOLD_OUT',
    });
    expect(hash).toMatchObject({
      stock: '80',
      reservedStock: '5',
      availableStock: '75',
      status: 'SOLD_OUT',
    });
  });

  it('상품 재고 Hash를 삭제한다', async () => {
    const product = await createProduct();
    await productHashService.getProductStock(product.id);
    const key = RedisKey.hash.productStock(product.id);

    await productHashService.deleteProductStockHash(product.id);

    await expect(redis.exists(key)).resolves.toBe(0);
  });
});
