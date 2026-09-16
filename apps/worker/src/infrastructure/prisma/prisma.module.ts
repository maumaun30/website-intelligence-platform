import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Global so any processor can inject the client without re-importing the module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
