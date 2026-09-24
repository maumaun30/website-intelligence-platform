import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { STRIPE_CLIENT, type StripeClient, StripeSignatureError } from './stripe/stripe-client';
import { StripeEventsService } from './stripe-events.service';

/**
 * Stripe's callback. No session and no guards: the signature IS the authentication, so the raw
 * body must survive to this point (see the raw-body mount in create-app.ts).
 */
@Controller('billing/webhook')
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    private readonly events: StripeEventsService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature || !Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Missing Stripe signature');
    }

    let event;
    try {
      event = this.stripe.constructEvent(request.body, signature);
    } catch (error) {
      if (error instanceof StripeSignatureError) {
        throw new BadRequestException('Invalid Stripe signature');
      }
      throw error;
    }

    // A throw here becomes a 500 and Stripe retries; the recorded event id makes that a no-op.
    await this.events.applyEvent(event);
    return { received: true };
  }
}
