import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { AddGoodreadsSourceDto, ListGoodreadsItemsDto, RenameGoodreadsSourceDto, ReplaceGoodreadsSnapshotDto } from './dto';
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
    return this.service.listItems(user, query);
  }

  @Get('items/:source/:key')
  getItem(@CurrentUser() user: RequestUser, @Param('source') source: string, @Param('key') key: string) {
    return this.service.getItem(user, source, key);
  }

  @Put('snapshot')
  replaceSnapshot(@CurrentUser() user: RequestUser, @Body() dto: ReplaceGoodreadsSnapshotDto) {
    return this.service.replaceSnapshot(user.id, dto);
  }

  @Post('sync')
  requestSync(@CurrentUser() user: RequestUser) {
    return this.service.requestSync(user.id);
  }

  @Post('sources')
  addSource(@CurrentUser() user: RequestUser, @Body() dto: AddGoodreadsSourceDto) {
    return this.service.addSource(user.id, dto);
  }

  @Patch('sources/:id')
  renameSource(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RenameGoodreadsSourceDto) {
    return this.service.renameSource(user.id, id, dto.name);
  }

  @Delete('sources/:id')
  removeSource(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeSource(user.id, id);
  }
}
