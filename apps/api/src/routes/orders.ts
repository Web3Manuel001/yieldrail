import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { parseUnits, type Order } from '@yieldrail/core';

import type { ApiContainer } from '../container';
import { sendError } from './http-error';

const createOrderBodySchema = z
  .object({
    kind: z.literal('subscribe'),
    investorId: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    usdcAmount: z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,7})?$/,
        'usdcAmount must be a decimal with at most 7 places',
      )
      .transform((value) => parseUnits(value))
      .refine((value) => value > 0n, 'usdcAmount must be positive'),
  })
  .strict();

const orderParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const idempotencyKeySchema = z.string().trim().min(1);

function toOrderResponse(order: Order) {
  return {
    id: order.id,
    idempotencyKey: order.idempotencyKey,
    investorId: order.investorId,
    productId: order.productId,
    kind: order.kind,
    status: order.status,
    usdcAmountMinor: order.usdcAmountMinor.toString(),
    sharesMinor: order.sharesMinor.toString(),
    navScaled: order.navScaled.toString(),
    remainderMinor: order.remainderMinor.toString(),
    collectTxHash: order.collectTxHash,
    mintTxHash: order.mintTxHash,
    refundTxHash: order.refundTxHash,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function registerOrderRoutes(
  app: FastifyInstance,
  container: ApiContainer,
): void {
  app.post('/v1/orders', async (request, reply) => {
    const key = idempotencyKeySchema.safeParse(
      request.headers['idempotency-key'],
    );
    const body = createOrderBodySchema.safeParse(request.body);
    if (!key.success || !body.success) {
      return reply.status(400).send({
        error: 'VALIDATION',
        message: 'Invalid order request',
      });
    }

    const result = await container.subscribeOrder.execute({
      idempotencyKey: key.data,
      investorId: body.data.investorId,
      productId: body.data.productId,
      usdcAmountMinor: body.data.usdcAmount,
    });
    if (!result.ok) return sendError(reply, result.error);

    return reply.status(200).send({ order: toOrderResponse(result.value.order) });
  });

  app.get('/v1/orders/:id', async (request, reply) => {
    const params = orderParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'VALIDATION',
        message: 'Invalid order id',
      });
    }

    const found = container.orderRepository.findById(params.data.id);
    if (!found.ok) return sendError(reply, found.error);
    if (found.value === null) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: `Order not found: ${params.data.id}`,
      });
    }

    return reply.status(200).send({ order: toOrderResponse(found.value) });
  });
}
