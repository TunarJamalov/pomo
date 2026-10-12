"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { addTodo, toggleTodo, deleteTodo } from "@/lib/db";
import { getTaskService, getIdentityService, isProductivityDbEnabled } from "@/lib/services";
import { revalidatePath } from "next/cache";

type TodoSource = "pg" | "sqlite";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQLITE_ID_RE = /^\d{1,12}$/;

async function getDiscordId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return null;
  return ((session.user as any).id as string) || null;
}

/**
 * Resolve the Postgres user UUID from the Discord id (null if Postgres is off).
 */
async function resolvePgUserId(discordId: string, create: boolean): Promise<string | null> {
  if (!isProductivityDbEnabled()) return null;
  const identityService = getIdentityService();
  if (create) {
    return await identityService.resolveIdentity('discord', discordId).then(r => r.userId);
  }
  return await identityService.lookupIdentity('discord', discordId);
}

function isValidId(id: string, source: TodoSource) {
  return source === "pg" ? UUID_RE.test(id) : SQLITE_ID_RE.test(id);
}

export async function createTodoAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const discordId = await getDiscordId();
  if (!discordId) throw new Error("Unauthorized");

  const content = formData.get("content")?.toString().trim().slice(0, 120);
  const subjectId = formData.get("subjectId")?.toString() || undefined;
  const rawPriority = formData.get("priority")?.toString();
  const priority: 'low' | 'medium' | 'high' =
    rawPriority === 'low' || rawPriority === 'high' ? rawPriority : 'medium';

  if (!content) return { ok: false, error: "Task cannot be empty." };

  // Write to SQLite (legacy store the Discord bot and Activity read).
  const sqliteOk = await addTodo(discordId, content);

  // Write to Postgres (Pomo 2.0 enriched task) when it is configured.
  // Never throw after the SQLite write succeeded.
  let pgError: string | undefined;
  if (isProductivityDbEnabled()) {
    try {
      const userId = await resolvePgUserId(discordId, true);
      if (userId) {
        await getTaskService().createTask(userId, content, {
          subjectId: subjectId && UUID_RE.test(subjectId) ? subjectId : undefined,
          priority,
        });
      }
    } catch (e: any) {
      console.error('[Tasks] Postgres write failed:', e?.message || e);
      pgError = "Saved for Discord, but the web task list is temporarily unavailable.";
    }
  }

  revalidatePath("/dashboard/todos");
  if (!sqliteOk && !isProductivityDbEnabled()) {
    return { ok: false, error: "Could not add task (you can keep up to 10 active tasks)." };
  }
  return pgError ? { ok: false, error: pgError } : { ok: true };
}

/**
 * Toggle only in the database the item was listed from. Postgres task ids are
 * UUIDs and SQLite todo ids are integers, so an id is never sent to the wrong
 * store.
 */
export async function toggleTodoAction(id: string, completed: boolean, source: TodoSource = "pg"): Promise<{ ok: boolean; error?: string }> {
  const discordId = await getDiscordId();
  if (!discordId) throw new Error("Unauthorized");
  if ((source !== "pg" && source !== "sqlite") || typeof id !== "string" || !isValidId(id, source)) {
    return { ok: false, error: "Invalid task." };
  }

  let ok = false;
  if (source === "sqlite") {
    ok = await toggleTodo(discordId, id, Boolean(completed));
  } else {
    if (!isProductivityDbEnabled()) return { ok: false, error: "Web tasks are unavailable right now." };
    try {
      const userId = await resolvePgUserId(discordId, false);
      if (userId) {
        const taskService = getTaskService();
        ok = completed
          ? await taskService.completeTask(userId, id)
          : await taskService.uncompleteTask(userId, id);
      }
    } catch (e: any) {
      console.error('[Tasks] Postgres toggle failed:', e?.message || e);
    }
  }

  revalidatePath("/dashboard/todos");
  return ok ? { ok } : { ok, error: "Task not found." };
}

export async function deleteTodoAction(id: string, source: TodoSource = "pg"): Promise<{ ok: boolean; error?: string }> {
  const discordId = await getDiscordId();
  if (!discordId) throw new Error("Unauthorized");
  if ((source !== "pg" && source !== "sqlite") || typeof id !== "string" || !isValidId(id, source)) {
    return { ok: false, error: "Invalid task." };
  }

  let ok = false;
  if (source === "sqlite") {
    ok = await deleteTodo(discordId, id);
  } else {
    if (!isProductivityDbEnabled()) return { ok: false, error: "Web tasks are unavailable right now." };
    try {
      const userId = await resolvePgUserId(discordId, false);
      if (userId) {
        ok = await getTaskService().deleteTask(userId, id);
      }
    } catch (e: any) {
      console.error('[Tasks] Postgres delete failed:', e?.message || e);
    }
  }

  revalidatePath("/dashboard/todos");
  return ok ? { ok } : { ok, error: "Task not found." };
}
