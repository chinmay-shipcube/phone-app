import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { one, pool } from './db/pool.js';
import { kit } from './print/kit.js';

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

async function main() {
  await migrate();
  const admin = await one(pool, "SELECT 1 FROM users WHERE role = 'admin' AND active");
  if (!admin) console.warn('No admin account yet. Run: npm run create-admin');

  const server = createApp().listen(config.port, config.host, () => {
    console.log(`Cell Decor billing is running on port ${config.port}.`);
    for (const ip of lanAddresses()) console.log(`  Phones open: http://${ip}:${config.port}`);
  });

  const stop = () => {
    console.log('Shutting down...');
    server.close(() => {
      kit.shutdown();
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('Could not start:', e.message);
  process.exit(1);
});
