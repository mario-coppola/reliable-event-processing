import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'app',
  password: process.env.PGPASSWORD ?? 'app',
  database: process.env.PGDATABASE ?? 'app',
  max: 5,
});
