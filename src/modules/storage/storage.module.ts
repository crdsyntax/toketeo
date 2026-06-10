import { Module, Global } from '@nestjs/common';
import { SqliteService } from './sqlite.service';
import { SqliteConnectionRepository } from './repositories/sqlite-connection.repository';
import { SqliteQueryHistoryRepository } from './repositories/sqlite-query-history.repository';
import { SqliteAuditRepository } from './repositories/sqlite-audit.repository';
import { SqliteFavoritesRepository } from './repositories/sqlite-favorites.repository';
import { SqliteSettingsRepository } from './repositories/sqlite-settings.repository';

@Global()
@Module({
  providers: [
    SqliteService,
    SqliteConnectionRepository,
    SqliteQueryHistoryRepository,
    SqliteAuditRepository,
    SqliteFavoritesRepository,
    SqliteSettingsRepository,
  ],
  exports: [
    SqliteService,
    SqliteConnectionRepository,
    SqliteQueryHistoryRepository,
    SqliteAuditRepository,
    SqliteFavoritesRepository,
    SqliteSettingsRepository,
  ],
})
export class StorageModule {}
