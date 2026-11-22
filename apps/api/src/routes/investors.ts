import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { AppError } from '@yieldrail/core';

import type { ApiContainer } from '../container';

const onboardBodySchema = z
  .object({
    investorId: z.string().trim().min(1),
    wallet: z.string().trim().min(1),
    jurisdiction: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'jurisdiction must be a 2-letter country code')
      .transform((value) => value.toUpperCase()),
    productId: z.string().trim().min(1),
  })
  .strict();

const eligibilityParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const eligibilityQuerySchema = z
  .object({
    productId: z.string().trim().min(1),
  })
  .strict();

function statusFor(error: AppError): number {
  switch (error.code) {
    case 'VALIDATION':
      return 400;
    case 'KYC_REJECTED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'IDEMPOTENCY':
      return 409;
    case 'INSUFFICIENT_FUNDS':
      return 422;
    case 'CHAIN':
      return 502;
    default:
      return 500;
  }
}

function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply
    .status(statusFor(error))
    .send({ error: error.code, message: error.message });
}

export function registerInvestorRoutes(
  app: FastifyInstance,
  container: ApiContainer,
): void {
  app.post('/v1/investors', async (request, reply) => {
    const body = onboardBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'VALIDATION',
        message: 'Invalid onboarding request',
        issues: body.error.issues,
      });
    }

    const result = await container.onboardInvestor.execute(body.data);
    if (!result.ok) return sendError(reply, result.error);

    return reply.status(200).send({
      eligibility: result.value.eligibility,
      authorizationTxHash: result.value.authorizationTxHash,
    });
  });

  app.get('/v1/investors/:id/eligibility', async (request, reply) => {
    const params = eligibilityParamsSchema.safeParse(request.params);
    const query = eligibilityQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({
        error: 'VALIDATION',
        message: 'Invalid eligibility request',
      });
    }

    const result = container.investors.findEligibility(
      params.data.id,
      query.data.productId,
    );
    if (!result.ok) return sendError(reply, result.error);

    if (result.value === null) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'Eligibility not found for this investor and product',
      });
    }

    return reply.status(200).send({
      eligibility: result.value.eligibility,
      authorizationTxHash: result.value.authorizationTxHash,
    });
  });
}
