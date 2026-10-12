"use client";

import { useTransition, useRef, useState } from "react";
import { createTodoAction, toggleTodoAction, deleteTodoAction } from "./actions";
import { Check, Clock, Trash2, Plus } from "lucide-react";

export type TodoSource = 'pg' | 'sqlite';

type Todo = {
  id: string;
  source: TodoSource;
  content: string;
  completed: number;
  focus_minutes?: number;
  created_at: number;
};

export default function TodoList({ initialTodos, subjects = [] }: { initialTodos: Todo[], subjects?: any[] }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await createTodoAction(formData);
      setError(res.ok ? null : res.error || "Something went wrong.");
      formRef.current?.reset();
    });
  };

  const handleToggle = (todo: Todo, currentlyCompleted: boolean) => {
    startTransition(async () => {
      const res = await toggleTodoAction(todo.id, !currentlyCompleted, todo.source);
      setError(res.ok ? null : res.error || "Something went wrong.");
    });
  };

  const handleDelete = (todo: Todo) => {
    startTransition(async () => {
      const res = await deleteTodoAction(todo.id, todo.source);
      setError(res.ok ? null : res.error || "Something went wrong.");
    });
  };

  return (
    <div className="w-full">
      {/* Add Form */}
      <form action={handleAdd} ref={formRef} className="mb-6 space-y-3 bg-white/5 border border-white/10 p-4 rounded-xl">
        <div className="flex gap-2">
          <input 
            type="text" 
            name="content" 
            placeholder="Add a new task..." 
            disabled={isPending}
            className="flex-1 bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--blurple)] transition-colors disabled:opacity-50"
            required
          />
          <button 
            type="submit" 
            disabled={isPending}
            className="bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
        
        <div className="flex gap-3">
          {subjects.length > 0 && (
            <select name="subjectId" className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none">
              <option value="">No Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select name="priority" className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="low">Low Priority</option>
            <option value="medium" selected>Medium Priority</option>
            <option value="high">High Priority</option>
          </select>
        </div>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">{error}</p>
      )}

      {/* Todo List */}
      <div className="space-y-3">
        {initialTodos.length === 0 ? (
          <div className="text-center py-10 text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl bg-black/10">
            No tasks found. Add a task above to get started!
          </div>
        ) : (
          initialTodos.map((todo) => {
            const isCompleted = todo.completed === 1;
            return (
              <div 
                key={`${todo.source}:${todo.id}`} 
                className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 ${isCompleted ? 'bg-black/20 border-[var(--border)] opacity-60' : 'bg-white/5 border-[var(--border)] hover:border-[var(--blurple)]/50 shadow-md'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <button 
                    onClick={() => handleToggle(todo, isCompleted)}
                    disabled={isPending}
                    className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors border ${isCompleted ? 'bg-[var(--green-neon)] border-[var(--green-neon)] text-black' : 'bg-transparent border-[var(--text-muted)] hover:border-[var(--blurple)]'}`}
                  >
                    {isCompleted && <Check size={14} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0">
                    <span className={`block truncate text-lg transition-all ${isCompleted ? 'line-through text-[var(--text-muted)]' : 'text-white'}`}>
                      {todo.content}
                    </span>
                    {Number(todo.focus_minutes || 0) > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--blurple)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                        <Clock size={12} />
                        {formatFocusMinutes(todo.focus_minutes || 0)} focused
                      </span>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => handleDelete(todo)}
                  disabled={isPending}
                  className="p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0 ml-2"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatFocusMinutes(minutes: number) {
  const total = Number(minutes || 0);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
