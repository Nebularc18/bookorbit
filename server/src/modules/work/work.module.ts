import { Module } from '@nestjs/common';
import { BookModule } from '../book/book.module';
import { LibraryModule } from '../library/library.module';
import { WorkController } from './work.controller';
import { WorkRepository } from './work.repository';
import { WorkService } from './work.service';
import { AchievementModule } from '../achievement/achievement.module';
import { UserModule } from '../user/user.module';
import { WorkReadSyncService } from './work-read-sync.service';

@Module({
  imports: [BookModule, LibraryModule, AchievementModule, UserModule],
  controllers: [WorkController],
  providers: [WorkService, WorkRepository, WorkReadSyncService],
})
export class WorkModule {}
