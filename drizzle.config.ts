import { defineConfig } from 'drizzle-kit'

import { validateDbEnvironment } from './src/config/environment'

import 'dotenv/config'

const env = validateDbEnvironment(process.env)

export default defineConfig({
    schema: './src/config/database/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    casing: 'snake_case',
    dbCredentials: {
        url: env.DATABASE_URL,
    },
})
