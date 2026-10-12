import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProductivityDbEnabled, getGoalService, getIdentityService } from "@/lib/services";
import FeatureUnavailable from "@/components/FeatureUnavailable";
import { redirect } from "next/navigation";
import { createGoalAction, deleteGoalAction } from "./actions";
import { Target } from "lucide-react";

export default async function GoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) redirect("/");

    if (!isProductivityDbEnabled()) return <FeatureUnavailable />;

  const discordId = (session.user as any).id;
  const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);

  let goals: any[] = [];
  if (userId) {
    goals = await getGoalService().listGoals(userId);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Target className="w-8 h-8 text-green-500" />
        <h1 className="text-3xl font-bold">Goals</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Form */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Set a New Goal</h2>
          <form action={createGoalAction} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Goal Type</label>
              <select name="type" required className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-green-500">
                <option value="focus_hours">Focus Hours</option>
                <option value="tasks_completed">Tasks Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Target Value</label>
              <input 
                type="number" name="targetValue" required min="1"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-green-500 transition-colors"
                placeholder="e.g. 50"
              />
            </div>
            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors">
              Set Goal
            </button>
          </form>
        </div>

        {/* Goals List */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Active Goals</h2>
          {goals.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">No active goals yet. Set one to start tracking!</p>
          ) : (
            <ul className="space-y-4">
              {goals.map((goal: any) => {
                const progress = Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
                
                return (
                  <li key={goal.id} className="p-4 rounded-lg bg-black/20 border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-white capitalize">{goal.type.replace('_', ' ')}</p>
                        <p className="text-sm text-[var(--text-secondary)]">{goal.current_value} / {goal.target_value}</p>
                      </div>
                      <form action={async () => { "use server"; await deleteGoalAction(goal.id); }}>
                        <button type="submit" className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                      </form>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-black/40 rounded-full h-2.5 mt-2 overflow-hidden border border-white/5">
                      <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
