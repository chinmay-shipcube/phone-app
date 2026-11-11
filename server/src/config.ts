import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** The folder that holds package.json, whether we run from server/src (tsx) or dist (node). */
function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const projectRoot = findProjectRoot();
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://celldecor:celldecor@127.0.0.1:5432/celldecor',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  printerOverride: process.env.PRINTER_OVERRIDE || '',
  printLog: process.env.PRINT_LOG || '',
  migrationsDir: path.join(projectRoot, 'server', 'src', 'db', 'migrations'),
  webDist: path.join(projectRoot, 'web', 'dist'),
  printerKit: path.join(projectRoot, 'server', 'vendor', 'universal-printer.cjs'),
  isTest: process.env.NODE_ENV === 'test',
};
