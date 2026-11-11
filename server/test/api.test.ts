import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { clearSettingsCache } from '../src/db/settings.js';
import { hashSecret } from '../src/auth/session.js';

// Runs against a real Postgres (TEST_DATABASE_URL, see vitest.config.ts). The schema is
// dropped and rebuilt at the start. Slips are written to a temp file instead of a printer.

const app = createApp();
const slipFile = path.join(os.tmpdir(), 'celldecor-test-slip.bin');
const uuid = () => crypto.randomUUID();

async function login(agent: ReturnType<typeof request.agent>, userId: number, pin?: string) {
  return agent.post('/api/auth/login').send({ userId, pin });
}

let rahulId = 0;
let amitId = 0;
let coverId = 0;
const admin = request.agent(app);
const rahul = request.agent(app);
const amit = request.agent(app);

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  clearSettingsCache();
  await migrate(() => {});
  await pool.query("INSERT INTO users (name, role, password_hash) VALUES ('Admin', 'admin', $1)", [await hashSecret('owner-pass-1')]);
  fs.rmSync(slipFile, { force: true });
});

afterAll(async () => {
  await pool.end();
});

describe('login', () => {
  it('admin logs in with the password only', async () => {
    expect((await admin.post('/api/auth/admin-login').send({ password: 'wrong' })).status).toBe(401);
    const r = await admin.post('/api/auth/admin-login').send({ password: 'owner-pass-1' });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('admin');
  });

  it('admin creates employees, with and without a PIN', async () => {
    const a = await admin.post('/api/users').send({ name: 'Rahul' });
    expect(a.status).toBe(201);
    rahulId = a.body.id;
    const b = await admin.post('/api/users').send({ name: 'Amit', pin: '4321' });
    amitId = b.body.id;
    expect(b.body.hasPin).toBe(true);
    expect((await admin.post('/api/users').send({ name: 'rahul ' })).status).toBe(409);
  });

  it('shows employee names on the login screen', async () => {
    const r = await request(app).get('/api/auth/names');
    expect(r.body.names.map((n: { name: string }) => n.name)).toEqual(['Amit', 'Rahul']);
    expect(r.body.adminExists).toBe(true);
  });

  it('employee without a PIN logs in by name; with a PIN needs it', async () => {
    expect((await login(rahul, rahulId)).status).toBe(200);
    expect((await login(amit, amitId)).status).toBe(401);
    expect((await login(amit, amitId, '4321')).status).toBe(200);
  });

  it('locks after five wrong PINs', async () => {
    const x = request.agent(app);
    for (let i = 0; i < 4; i++) expect((await login(x, amitId, '0000')).status).toBe(401);
    expect((await login(x, amitId, '0000')).status).toBe(423);
    expect((await login(x, amitId, '4321')).status).toBe(423);
    await admin.patch(`/api/users/${amitId}`).send({ pin: '4321' }); // admin reset clears the lock
    expect((await login(amit, amitId, '4321')).status).toBe(200);
  });

  it('employee can set their own PIN', async () => {
    const r = await rahul.post('/api/auth/pin').send({ newPin: '1111' });
    expect(r.body.hasPin).toBe(true);
    expect((await rahul.post('/api/auth/pin').send({ newPin: null })).status).toBe(401); // needs current PIN
    expect((await rahul.post('/api/auth/pin').send({ currentPin: '1111', newPin: null })).body.hasPin).toBe(false);
  });
});

describe('permissions', () => {
  it('employees cannot reach admin endpoints', async () => {
    for (const [method, url] of [
      ['get', '/api/users'],
      ['get', '/api/reports/summary'],
      ['get', '/api/settings'],
      ['post', '/api/items'],
    ] as const) {
      expect((await rahul[method](url).send({})).status).toBe(403);
    }
    expect((await request(app).get('/api/bills')).status).toBe(401);
  });
});

describe('billing', () => {
  it('admin adds items; staff see active ones only', async () => {
    const a = await admin.post('/api/items').send({ name: 'iPhone 16 Cover', defaultPricePaise: 29900, hsn: '3926', gstBp: 1800 });
    expect(a.status).toBe(201);
    coverId = a.body.id;
    await admin.post('/api/items').send({ name: 'Old Charger', active: false });
    const r = await rahul.get('/api/items');
    expect(r.body.map((i: { name: string }) => i.name)).toEqual(['iPhone 16 Cover']);
  });

  it('saves, numbers and prints a bill in one request', async () => {
    await admin.put('/api/settings').send({
      ...(await admin.get('/api/settings')).body,
      gstin: '27AAPFU0939F1ZV',
      addressLine1: 'Shop 12, Main Road',
    });
    const r = await rahul.post('/api/bills').send({
      clientRequestId: uuid(),
      lines: [
        { itemId: coverId, name: 'iPhone 16 Cover', qty: 2, ratePaise: 25000 },
        { itemId: null, name: 'Screen guard fitting', qty: 1, ratePaise: 5000 },
      ],
      discountPaise: 1000,
      paymentMode: 'upi',
    });
    expect(r.status).toBe(201);
    expect(r.body.print.status).toBe('printed');
    expect(r.body.bill.invoiceNo).toMatch(/^CD\/\d{2}-\d{2}\/00001$/);
    expect(r.body.bill.totalPaise).toBe(54000);
    expect(r.body.bill.lines[1].custom).toBe(true);
    const slip = fs.readFileSync(slipFile).toString('latin1');
    expect(slip).toContain('TAX INVOICE');
    expect(slip).toContain('iPhone 16 Cover');
    expect(slip).toContain('Rs.540.00');
  });

  it('a retried request returns the same bill and does not print again', async () => {
    const id = uuid();
    const body = { clientRequestId: id, lines: [{ itemId: coverId, name: 'x', qty: 1, ratePaise: 29900 }], paymentMode: 'cash' };
    const first = await amit.post('/api/bills').send(body);
    const second = await amit.post('/api/bills').send(body);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.print).toBeNull();
    expect(second.body.bill.invoiceNo).toBe(first.body.bill.invoiceNo);
    expect(first.body.bill.invoiceNo).toMatch(/00002$/);
  });

  it('refuses unlisted items when the admin turns them off', async () => {
    const s = (await admin.get('/api/settings')).body;
    await admin.put('/api/settings').send({ ...s, allowCustomItems: false });
    const r = await rahul.post('/api/bills').send({
      clientRequestId: uuid(),
      lines: [{ itemId: null, name: 'Mystery', qty: 1, ratePaise: 100 }],
      paymentMode: 'cash',
    });
    expect(r.status).toBe(400);
    await admin.put('/api/settings').send({ ...s, allowCustomItems: true });
  });

  it('employees see and reprint only their own bills', async () => {
    const own = (await rahul.get('/api/bills')).body;
    expect(own.bills.every((b: { employeeName: string }) => b.employeeName === 'Rahul')).toBe(true);
    const amitBill = (await amit.get('/api/bills')).body.bills[0];
    expect((await rahul.post(`/api/bills/${amitBill.id}/reprint`)).status).toBe(403);
    const re = await amit.post(`/api/bills/${amitBill.id}/reprint`);
    expect(re.body.print.status).toBe('printed');
    expect(fs.readFileSync(slipFile).toString('latin1')).toContain('DUPLICATE COPY');
  });

  it('only the admin voids, and voided bills leave the sales total', async () => {
    const bill = (await amit.get('/api/bills')).body.bills[0];
    expect((await amit.post(`/api/bills/${bill.id}/void`).send({ reason: 'Customer returned it' })).status).toBe(403);
    const v = await admin.post(`/api/bills/${bill.id}/void`).send({ reason: 'Customer returned it' });
    expect(v.body.status).toBe('voided');
    expect((await amit.post(`/api/bills/${bill.id}/reprint`)).status).toBe(409);

    const rep = (await admin.get('/api/reports/summary')).body;
    expect(rep.bills).toBe(1);
    expect(rep.salesPaise).toBe(54000);
    const amitRow = rep.employees.find((e: { name: string }) => e.name === 'Amit');
    expect(amitRow.voids).toBe(1);
    const items = (await admin.get('/api/reports/items').query({ employeeId: rahulId })).body;
    expect(items.find((i: { name: string }) => i.name === 'iPhone 16 Cover').qty).toBe(2);
  });

  it('deactivating an employee logs them out', async () => {
    await admin.patch(`/api/users/${amitId}`).send({ active: false });
    expect((await amit.get('/api/auth/me')).body).toBeNull();
    expect((await amit.get('/api/bills')).status).toBe(401);
  });
});
