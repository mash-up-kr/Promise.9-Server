import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/config/environment';

const databaseUrl = resolveDatabaseUrl(process.env);

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
