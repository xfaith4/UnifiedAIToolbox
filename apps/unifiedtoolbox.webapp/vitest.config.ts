import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/app/milestones/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/lib/app-factory/**/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
