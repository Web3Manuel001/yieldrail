import type { FastifyReply } from 'fastify';

import type { AppError } from '@yieldrail/core';

/** Map a domain error code onto the public HTTP contract. */
export function statusFor(error: AppError): number {
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

export function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply
    .status(statusFor(error))
    .send({ error: error.code, message: error.message });
}
