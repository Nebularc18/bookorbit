import { Module } from '@nestjs/common';
import { BookModule } from '../book/book.module';
import { LibraryModule } from '../library/library.module';
import { WorkController } from './work.controller';
import { WorkRepository } from './work.repository';
import { WorkService } from './work.service';

@Module({ imports: [BookModule, LibraryModule], controllers: [WorkController], providers: [WorkService, WorkRepository] })
export class WorkModule {}
