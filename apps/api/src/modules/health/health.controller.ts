import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthCheckResponse } from '@wintel/types';
import type { Response } from 'express';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Returns 200 when healthy and 503 when degraded, so load balancers and uptime checks can
   * act on the status code while humans read the body.
   */
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthCheckResponse> {
    const result = await this.health.check();

    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return result;
  }
}
