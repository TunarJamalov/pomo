import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProductivityDbEnabled, getNoteService, getIdentityService, getSubjectService } from "@/lib/services";
import FeatureUnavailable from "@/components/FeatureUnavailable";
import { redirect } from "next/navigation";
import { createNoteAction, deleteNoteAction } from "./actions";
import { FileText } from "lucide-react";

export default async function NotesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) redirect("/");

    if (!isProductivityDbEnabled()) return <FeatureUnavailable />;

  const discordId = (session.user as any).id;
  const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);

  let notes: any[] = [];
  let subjects: any[] = [];
  if (userId) {
    notes = await getNoteService().listNotes(userId);
    subjects = await getSubjectService().listSubjects(userId);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-8 h-8 text-[var(--orange-neon)]" />
        <h1 className="text-3xl font-bold">Notes</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Form */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">New Note</h2>
          <form action={createNoteAction} className="space-y-4">
            <input 
              type="text" name="title" required 
              className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-[var(--blurple)] transition-colors"
              placeholder="Note title..."
            />
            {subjects.length > 0 && (
              <select name="subjectId" className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-[var(--blurple)]">
                <option value="">No Subject</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <button type="submit" className="w-full btn-primary py-2 rounded-lg transition-colors">
              Create Note
            </button>
          </form>
        </div>

        {/* Notes List */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Your Notes</h2>
          {notes.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">No notes yet. Create your first note!</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note: any) => (
                <li key={note.id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                  <div>
                    <p className="font-medium text-white">{note.title}</p>
                    {note.subject_id && (
                      <p className="text-xs text-[var(--orange-neon)] mt-0.5">
                        {subjects.find((s: any) => s.id === note.subject_id)?.name || 'Subject'}
                      </p>
                    )}
                  </div>
                  <form action={async () => { "use server"; await deleteNoteAction(note.id); }}>
                    <button type="submit" className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
