/**
 * Memory bank actions.
 *
 * Per Blueprint 5.0 Part 3.4, an agent that cannot remember
 * preferences is just a stateless calculator. This module owns
 * the long-term memory CRUD: fetch, purge, add global items,
 * and review (pin/mark-reviewed). Compaction writes to the
 * same table — see lib/context/compaction.ts.
 */
import crypto from 'crypto';
import { z } from 'zod';
import dbClient from '@/lib/database/db_client';

export async function fetchMemoryItemsAction() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Memory_Items ORDER BY created_at DESC`);
    return rows.map((r: any) => {
      let key = r.scope || 'General';
      let value = r.content || '';
      try {
        const parsed = JSON.parse(r.content);
        if (parsed.key) key = parsed.key;
        if (parsed.value) value = parsed.value;
      } catch (e) {}
      return {
        id: r.id,
        key,
        value,
        type: r.type || 'semantic',
        scope: r.scope || 'General',
        importance: r.importance >= 0.8 ? 'High' : r.importance >= 0.4 ? 'Medium' : 'Low',
        pinned: r.pinned === 1,
        reason: r.reason || `Used when ${r.scope || 'General'} context is active.`,
        reviewedAt: r.reviewed_at,
        stale: !r.reviewed_at && new Date(r.created_at).getTime() < Date.now() - 1000 * 60 * 60 * 24 * 30,
        createdAt: r.created_at,
      };
    });
  } catch (error) {
    console.error("Failed to fetch memory items:", error);
    return [];
  }
}

export async function purgeMemoryItemsAction(scope: string) {
  try {
    if (scope === 'all') {
      await dbClient.execute(`DELETE FROM Memory_Items`);
    } else {
      await dbClient.execute(`DELETE FROM Memory_Items WHERE scope = ? OR type = ?`, [scope, scope.toLowerCase()]);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to purge memory items:", error);
    return { success: false, error: String(error) };
  }
}

export async function addGlobalMemoryItemAction(key: string, value: string, importance: string, scope: string = 'User') {
  try {
    const sql = `
      INSERT INTO Memory_Items (id, scope, type, content, importance, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const impVal = importance === 'High' ? 0.8 : importance === 'Medium' ? 0.5 : 0.2;
    await dbClient.execute(sql, [
      `mem-${crypto.randomUUID()}`,
      scope,
      'semantic',
      JSON.stringify({ key, value }),
      impVal,
      `Manual ${scope} memory added from Settings.`,
    ]);
    return { success: true };
  } catch (error) {
    console.error("Failed to add memory item:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateMemoryReviewAction(id: string, updates: { pinned?: boolean; reviewed?: boolean }) {
  try {
    z.string().min(1).parse(id);
    if (typeof updates.pinned === 'boolean') {
      await dbClient.execute(`UPDATE Memory_Items SET pinned = ? WHERE id = ?`, [updates.pinned ? 1 : 0, id]);
    }
    if (updates.reviewed) {
      await dbClient.execute(`UPDATE Memory_Items SET reviewed_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to update memory review:", error);
    return { success: false, error: String(error) };
  }
}
