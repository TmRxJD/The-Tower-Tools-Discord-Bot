import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      // Fake credentials so the suite never depends on a real .env file: the config loader
      // insists on these, and CI runs from a checkout that has none.
      DISCORD_TOKEN: 'test-discord-token',
      CLIENT_ID: '100000000000000001',
      DEV_DISCORD_TOKEN: 'test-dev-discord-token',
      DEV_CLIENT_ID: '100000000000000002',
      DEV_GUILD_ID: '100000000000000003',
    },
  },
});
