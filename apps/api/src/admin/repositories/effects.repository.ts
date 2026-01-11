import { Injectable } from '@nestjs/common';
import { db } from '../../db';

export type EffectRow = {
  id: number;
  idempotency_key: string;
  subscription_id: string;
  status: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class EffectsRepository {
  async findEffects(limit: number): Promise<EffectRow[]> {
    const client = await db.connect();
    try {
      const result = await client.query<EffectRow>(
        `
        SELECT id, idempotency_key, subscription_id, status, error_message, created_at, updated_at
        FROM subscription_activations
        ORDER BY id DESC
        LIMIT $1
        `,
        [limit],
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}
