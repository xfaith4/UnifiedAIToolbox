import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/app/milestones/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/app/engine/_source/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/lib/app-factory/**/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    alias: {
      'server-only': path.resolve(__dirname, './vitest-mocks/server-only.ts'),
    },
  },
});
