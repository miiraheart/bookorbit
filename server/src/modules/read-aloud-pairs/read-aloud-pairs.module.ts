import { Module } from '@nestjs/common';

import { BookModule } from '../book/book.module';
import { LibraryModule } from '../library/library.module';
import { ReadAlongMatchIndex } from './read-aloud-match-index';
import { ReadAloudMatchIndexRepository } from './read-aloud-match-index.repository';
import { ReadAloudPairListService } from './read-aloud-pair-list.service';
import { ReadAloudPairController } from './read-aloud-pair.controller';
import { ReadAloudPairService } from './read-aloud-pair.service';
import { ReadAloudPairsDataModule } from './read-aloud-pairs-data.module';

@Module({
  imports: [ReadAloudPairsDataModule, BookModule, LibraryModule],
  controllers: [ReadAloudPairController],
  providers: [ReadAloudMatchIndexRepository, ReadAlongMatchIndex, ReadAloudPairService, ReadAloudPairListService],
})
export class ReadAloudPairsModule {}
