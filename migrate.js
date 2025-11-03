import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

class DatabaseMigrator {
  constructor() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to database');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    await this.client.end();
    console.log('📤 Disconnected from database');
  }

  async ensureSchemaTable() {
    const query = `
      GRANT CREATE ON SCHEMA public TO CURRENT_USER;
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    try {
      await this.client.query(query);
      console.log('✅ Schema migrations table ready');
    } catch (error) {
      console.error('❌ Failed to create schema migrations table:', error.message);
      throw error;
    }
  }

  async getAppliedMigrations() {
    try {
      const result = await this.client.query('SELECT version FROM schema_migrations ORDER BY version');
      return result.rows.map(row => row.version);
    } catch (error) {
      console.error('❌ Failed to get applied migrations:', error.message);
      return [];
    }
  }

  async getMigrationFiles() {
    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const files = await fs.readdir(migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort()
        .map(file => ({
          version: file.replace('.sql', ''),
          filename: file,
          path: path.join(migrationsDir, file)
        }));
    } catch (error) {
      console.error('❌ Failed to read migration files:', error.message);
      return [];
    }
  }

  async runMigration(migration) {
    try {
      console.log(`🔄 Running migration: ${migration.version}`);

      // Read migration file
      const sql = await fs.readFile(migration.path, 'utf8');

      // Begin transaction
      await this.client.query('BEGIN');

      try {
        // Execute migration SQL
        await this.client.query(sql);

        // Record migration as applied (if not already recorded by the migration itself)
        await this.client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
          [migration.version]
        );

        // Commit transaction
        await this.client.query('COMMIT');

        console.log(`✅ Migration completed: ${migration.version}`);
        return true;
      } catch (error) {
        // Rollback transaction
        await this.client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error(`❌ Migration failed: ${migration.version}`, error.message);
      throw error;
    }
  }

  async runPendingMigrations() {
    try {
      console.log('🔍 Checking for pending migrations...');

      const appliedMigrations = await this.getAppliedMigrations();
      const migrationFiles = await this.getMigrationFiles();

      const pendingMigrations = migrationFiles.filter(
        migration => !appliedMigrations.includes(migration.version)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations');
        return true;
      }

      console.log(`📦 Found ${pendingMigrations.length} pending migration(s)`);

      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }

      console.log('🎉 All migrations completed successfully');
      return true;
    } catch (error) {
      console.error('💥 Migration process failed:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      const result = await this.client.query('SELECT NOW() as current_time, version() as pg_version');
      console.log('🔗 Database connection test successful');
      console.log(`   Time: ${result.rows[0].current_time}`);
      console.log(`   PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      return false;
    }
  }

  async run() {
    try {
      await this.connect();
      await this.testConnection();
      await this.ensureSchemaTable();
      await this.runPendingMigrations();
      await this.disconnect();
      return true;
    } catch (error) {
      console.error('💥 Migration runner failed:', error.message);
      try {
        await this.disconnect();
      } catch (disconnectError) {
        console.error('❌ Failed to disconnect:', disconnectError.message);
      }
      throw error;
    }
  }
}

// Export for use in other files
export default DatabaseMigrator;

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new DatabaseMigrator();
  migrator.run()
    .then(() => {
      console.log('🏁 Migration runner completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('🚨 Migration runner failed:', error.message);
      process.exit(1);
    });
}