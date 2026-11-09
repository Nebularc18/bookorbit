import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Permission } from '@bookorbit/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { EditionSearchQueryDto, GroupWorkDto, WorkCatalogQueryDto } from './dto/work.dto';
import { WorkService } from './work.service';

@Controller('works')
export class WorkController {
  constructor(private readonly service: WorkService) {}
  @Get()
  catalog(@Query() query: WorkCatalogQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.catalog(query, user);
  }
  @Get('editions/:bookId/linked-unread')
  linkedUnreadEditions(@Param('bookId', ParseIntPipe) bookId: number, @CurrentUser() user: RequestUser) {
    return this.service.linkedUnreadEditions(bookId, user);
  }
  @Get('editions/:bookId/linked')
  editionLinks(@Param('bookId', ParseIntPipe) bookId: number, @CurrentUser() user: RequestUser) {
    return this.service.editionLinks(bookId, user);
  }
  @Get('editions/:bookId/candidates')
  @RequirePermission(Permission.LibraryEditMetadata)
  editionCandidates(@Param('bookId', ParseIntPipe) bookId: number, @Query() query: EditionSearchQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.editionLinks(bookId, user, query);
  }
  @Post()
  @RequirePermission(Permission.LibraryEditMetadata)
  group(@Body() dto: GroupWorkDto, @CurrentUser() user: RequestUser) {
    return this.service.group(dto, user);
  }
  @Delete(':workId/editions/:bookId')
  @RequirePermission(Permission.LibraryEditMetadata)
  ungroup(@Param('workId', ParseIntPipe) workId: number, @Param('bookId', ParseIntPipe) bookId: number, @CurrentUser() user: RequestUser) {
    return this.service.ungroup(workId, bookId, user);
  }
}
