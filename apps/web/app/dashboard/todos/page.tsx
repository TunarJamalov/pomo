import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserTodos } from "@/lib/db";
import TodoList, { type TodoSource } from "./TodoList";
import { CheckSquare } from "lucide-react";

// Disable cache for this page since todos are dynamic
export const dynamic = 'force-dynamic';

export default async function TodosPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  
  
  // Source of each listed item is tracked so toggle/delete only touch the
  // database the item actually came from:
  //  - Postgres enabled  -> Pomo 2.0 tasks (Postgres), as before.
  //  - Postgres disabled -> the bot's SQLite todos (shared with Discord/Activity).
  const { getIdentityService, getSubjectService, getTaskService, isProductivityDbEnabled } = await import("@/lib/services");
  let subjects: any[] = [];
  let todos: any[] = [];
  let source: TodoSource = 'sqlite';
  if (isProductivityDbEnabled()) {
    source = 'pg';
    try {
      const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);
      if (userId) {
        subjects = await getSubjectService().listSubjects(userId);
        todos = await getTaskService().listTasks(userId, false);
      }
    } catch (err) {
      console.error('[Todos] Failed to load Postgres tasks:', err);
    }
  } else {
    todos = await getUserTodos(discordId);
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[var(--blurple)]/20 flex items-center justify-center border border-[var(--blurple)]/30">
          <CheckSquare className="text-[var(--blurple)]" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">To-Do List</h1>
          <p className="text-[var(--text-secondary)]">Manage your tasks and clear your mind.</p>
        </div>
      </div>

      <div className="glass-panel p-8">
        <TodoList 
          initialTodos={todos.map((t: any) => ({ ...t, id: String(t.id), completed: t.completed ? 1 : 0, source }))} 
          subjects={subjects}
        />
      </div>

    </div>
  );
}
