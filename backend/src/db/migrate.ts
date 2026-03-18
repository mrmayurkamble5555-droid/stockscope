import { db, testDbConnection } from './connection';
import fs from 'fs';
import path from 'path';

async function migrate() {
  console.log('🔄 Running migrations...');
  const ok = await testDbConnection();
  if (!ok) { process.exit(1); }

  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations/all_migrations.sql'),
    'utf8'
  );

  try {
    await db.query(sql);
    console.log('✅ All migrations completed successfully');

    // Verify tables exist
    const res = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('📋 Tables created:', res.rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

migrate();
