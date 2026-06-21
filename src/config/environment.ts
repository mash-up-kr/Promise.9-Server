export type RuntimeEnvironment = 'development' | 'production' | 'test';

const databaseUrlByEnvironment: Record<
  RuntimeEnvironment,
  'DATABASE_URL_DEVELOPMENT' | 'DATABASE_URL_PRODUCTION'
> = {
  development: 'DATABASE_URL_DEVELOPMENT',
  test: 'DATABASE_URL_DEVELOPMENT',
  production: 'DATABASE_URL_PRODUCTION',
};

export type ValidatedEnvironment = NodeJS.ProcessEnv & {
  NODE_ENV: RuntimeEnvironment;
  DATABASE_URL: string;
};

export function validateEnvironment(
  config: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = parseNodeEnv(config.NODE_ENV);
  const databaseUrlKey = databaseUrlByEnvironment[nodeEnv];
  const databaseUrl = parseDatabaseUrl(config[databaseUrlKey], databaseUrlKey);

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
  };
}

export function resolveDatabaseUrl(config: NodeJS.ProcessEnv) {
  return validateEnvironment(config).DATABASE_URL;
}

function parseNodeEnv(value: unknown): RuntimeEnvironment {
  if (value === undefined || value === '') {
    return 'development';
  }

  if (value === 'development' || value === 'production' || value === 'test') {
    return value;
  }

  throw new Error('NODE_ENV must be one of: development, production, test.');
}

function parseDatabaseUrl(value: unknown, key: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required.`);
  }

  const databaseUrl = value.trim();

  try {
    const parsedUrl = new URL(databaseUrl);

    if (
      parsedUrl.protocol !== 'postgres:' &&
      parsedUrl.protocol !== 'postgresql:'
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL connection URL.`);
  }

  return databaseUrl;
}
