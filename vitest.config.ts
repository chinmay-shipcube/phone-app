import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/test/**/*.test.ts'],
    fileParallelism: false, // the API tests share one test database
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://celldecor:celldecor@127.0.0.1:5432/celldecor_test',
      // Slips go to a file instead of a printer during tests.
      PRINTER_OVERRIDE: `file:${path.join(os.tmpdir(), 'celldecor-test-slip.bin')}`,
    },
  },
});
