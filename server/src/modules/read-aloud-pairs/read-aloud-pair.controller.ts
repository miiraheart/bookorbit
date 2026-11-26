import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForbidPermission } from '../../common/decorators/forbid-permission.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { ListReadAlongQueryDto, ReadAlongCandidatesQueryDto } from './dto/list-read-along.query.dto';
import { AcceptExactDto, DismissCandidateDto, PairEbookDto } from './dto/pair-ebook.dto';
import { ReadAloudPairListService } from './read-aloud-pair-list.service';
import { ReadAloudPairService } from './read-aloud-pair.service';

/** Gated like generating a read-along; each book is checked for access in the services. */
@Controller()
@RequirePermission(Permission.LibraryGenerateReadAloud)
@ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot pair read-along books')
export class ReadAloudPairController {
  constructor(
    private readonly pairs: ReadAloudPairService,
    private readonly list: ReadAloudPairListService,
  ) {}

  @Get('read-aloud/pairs')
  listPairs(@Query() query: ListReadAlongQueryDto, @CurrentUser() user: RequestUser) {
    return this.list.list(query, user);
  }

  @Post('read-aloud/pairs/accept-exact')
  @HttpCode(HttpStatus.OK)
  acceptExact(@Body() dto: AcceptExactDto, @CurrentUser() user: RequestUser) {
    return this.list.acceptExact(dto.libraryId, user, dto.dryRun === true);
  }

  @Get('books/:bookId/read-aloud/candidates')
  candidates(@Param('bookId', ParseIntPipe) bookId: number, @Query() query: ReadAlongCandidatesQueryDto, @CurrentUser() user: RequestUser) {
    return this.list.candidates(bookId, query, user);
  }

  @Get('books/:bookId/read-aloud/paired-audiobooks')
  pairedAudiobooks(@Param('bookId', ParseIntPipe) bookId: number, @CurrentUser() user: RequestUser) {
    return this.list.pairedAudiobooks(bookId, user);
  }

  @Post('books/:bookId/read-aloud/candidates/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@Param('bookId', ParseIntPipe) bookId: number, @Body() dto: DismissCandidateDto, @CurrentUser() user: RequestUser) {
    return this.pairs.dismiss(bookId, dto.ebookBookId, user);
  }

  @Post('books/:bookId/read-aloud/candidates/undismiss')
  @HttpCode(HttpStatus.OK)
  undismiss(@Param('bookId', ParseIntPipe) bookId: number, @Body() dto: DismissCandidateDto, @CurrentUser() user: RequestUser) {
    return this.pairs.undismiss(bookId, dto.ebookBookId, user);
  }

  @Put('books/:bookId/read-aloud/pair')
  pair(@Param('bookId', ParseIntPipe) bookId: number, @Body() dto: PairEbookDto, @CurrentUser() user: RequestUser) {
    return this.pairs.pair(bookId, dto, user);
  }

  @Delete('books/:bookId/read-aloud/pair')
  @HttpCode(HttpStatus.OK)
  unpair(@Param('bookId', ParseIntPipe) bookId: number, @CurrentUser() user: RequestUser) {
    return this.pairs.unpair(bookId, user);
  }
}
