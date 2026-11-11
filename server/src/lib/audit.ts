import type { Db } from '../db/pool.js';

export async function audit(
  db: Db,
  actorId: number | null,
  action: string,
  entity: string,
  entityId: string | number,
  before: unknown = null,
  after: unknown = null,
): Promise<void> {
  await db.query('INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after) VALUES ($1, $2, $3, $4, $5, $6)', [
    actorId,
    action,
    entity,
    String(entityId),
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
  ]);
}
