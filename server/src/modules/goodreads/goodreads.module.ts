import { Module } from '@nestjs/common';

import { GoodreadsController } from './goodreads.controller';
import { GoodreadsRepository } from './goodreads.repository';
import { GoodreadsService } from './goodreads.service';

@Module({
  controllers: [GoodreadsController],
  providers: [GoodreadsRepository, GoodreadsService],
})
export class GoodreadsModule {}
