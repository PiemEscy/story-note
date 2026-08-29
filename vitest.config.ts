import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['electron/**/*.test.ts'],
        },
      },
    ],
  },
});
