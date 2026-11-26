import { Module } from '@nestjs/common';

import { BookModule } from '../book/book.module';
import { GoodreadsController } from './goodreads.controller';
import { GoodreadsRepository } from './goodreads.repository';
import { GoodreadsService } from './goodreads.service';

@Module({
  imports: [BookModule],
  controllers: [GoodreadsController],
  providers: [GoodreadsRepository, GoodreadsService],
})
export class GoodreadsModule {}
