import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        // Test bindings - these would be overridden in actual tests
        JWT_SECRET: 'test-jwt-secret-key-for-testing',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing',
        RESEND_API_KEY: 'test-resend-api-key',
        RATE_LIMIT_REQUESTS: '100',
        RATE_LIMIT_WINDOW: '60',
      },
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/**/*.test.ts'],
    },
  },
});
