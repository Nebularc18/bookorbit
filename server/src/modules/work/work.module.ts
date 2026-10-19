import { Module } from '@nestjs/common';
import { BookModule } from '../book/book.module';
import { LibraryModule } from '../library/library.module';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

@Module({ imports: [BookModule, LibraryModule], controllers: [WorkController], providers: [WorkService] })
export class WorkModule {}
