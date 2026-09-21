import { randomUUID } from 'node:crypto';

import { type DynamicModule, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiConfigModule } from './config/api-config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuditsModule } from './modules/audits/audits.module';
import { ExplanationsModule } from './modules/explanations/explanations.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ScansModule } from './modules/scans/scans.module';
import { WebsitesModule } from './modules/websites/websites.module';

@Module({})
export class AppModule {
  static forEnv(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ApiConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (request, response) => {
              const incoming = request.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
              response.setHeader('x-request-id', id);
              return id;
            },
            // Uptime checks poll this endpoint constantly; logging every hit buries real traffic.
            autoLogging: { ignore: (request) => request.url === '/api/v1/health' },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["set-cookie"]',
              ],
              remove: true,
            },
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
                : undefined,
          },
        }),
        PrismaModule,
        RedisModule,
        AuthModule,
        BillingModule,
        WebsitesModule,
        ScansModule,
        AuditsModule,
        InsightsModule,
        ExplanationsModule,
        HealthModule,
      ],
      providers: [AllExceptionsFilter],
    };
  }
}
