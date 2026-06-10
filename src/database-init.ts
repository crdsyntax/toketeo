import * as mysql from 'mysql2/promise';
import { Logger } from '@nestjs/common';

export async function initDatabase() {
  const logger = new Logger('DatabaseInit');
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  try {
    const connection = await mysql.createConnection(config);
    
    logger.log(`Using default database ${process.env.DB_NAME || 'mysql'} for configuration.`);
    // No longer creating custom tables like toketeo_connections, users, audit_logs, query_history
    // as per user requirement to use default system tables.

    await connection.end();
    logger.log('Database initialization (system tables check) completed.');
  } catch (error) {
    logger.error(`Database initialization failed: ${error.message}`);
  }
}
