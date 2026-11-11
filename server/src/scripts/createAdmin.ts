// `npm run create-admin`: creates the admin account, or resets its password.
// Run it on the shop laptop. The password can also come from ADMIN_PASSWORD (for scripts).
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { migrate } from '../db/migrate.js';
import { one, pool } from '../db/pool.js';
import { hashSecret } from '../auth/session.js';

async function main() {
  await migrate(() => {});
  let password = process.env.ADMIN_PASSWORD || '';
  if (!password) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    password = await rl.question('New admin password (at least 8 characters): ');
    const again = await rl.question('Type it again: ');
    rl.close();
    if (password !== again) throw new Error('The two passwords do not match.');
  }
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const hash = await hashSecret(password);
  const existing = await one<{ id: number }>(pool, "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (existing) {
    await pool.query('UPDATE users SET password_hash = $1, active = true, failed_attempts = 0, locked_until = NULL WHERE id = $2', [
      hash,
      existing.id,
    ]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
    console.log('Admin password reset.');
  } else {
    await pool.query("INSERT INTO users (name, role, password_hash) VALUES ('Admin', 'admin', $1)", [hash]);
    console.log('Admin account created.');
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
