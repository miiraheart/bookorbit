import { Module } from '@nestjs/common';

import { ReadAloudPairsRepository } from './read-aloud-pairs.repository';

/** Pair storage only, with no module imports, so the read-aloud and book modules can use it without a cycle. */
@Module({
  providers: [ReadAloudPairsRepository],
  exports: [ReadAloudPairsRepository],
})
export class ReadAloudPairsDataModule {}
