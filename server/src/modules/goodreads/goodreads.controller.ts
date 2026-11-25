import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { ListGoodreadsItemsDto, ReplaceGoodreadsSnapshotDto } from './dto';
import { GoodreadsService } from './goodreads.service';

/** Every route is the caller's own shelves: nothing here reads or writes another user's data. */
@Controller('goodreads')
export class GoodreadsController {
  constructor(private readonly service: GoodreadsService) {}

  @Get()
  getOverview(@CurrentUser() user: RequestUser) {
    return this.service.getOverview(user.id);
  }

  @Get('items')
  listItems(@CurrentUser() user: RequestUser, @Query() query: ListGoodreadsItemsDto) {
    return this.service.listItems(user.id, query);
  }

  @Put('snapshot')
  replaceSnapshot(@CurrentUser() user: RequestUser, @Body() dto: ReplaceGoodreadsSnapshotDto) {
    return this.service.replaceSnapshot(user.id, dto);
  }

  @Post('sync')
  requestSync(@CurrentUser() user: RequestUser) {
    return this.service.requestSync(user.id);
  }
}
