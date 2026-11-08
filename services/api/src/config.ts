export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const host = env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Foundation API must bind to loopback');
  if (env.NEAR_NETWORK && env.NEAR_NETWORK !== 'testnet') throw new Error('Only NEAR testnet is supported');
  return { port, host, databasePath: env.DATABASE_PATH ?? './data/writbound.sqlite' };
}
