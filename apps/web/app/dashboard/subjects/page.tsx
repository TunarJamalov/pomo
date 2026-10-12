import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProductivityDbEnabled, getSubjectService, getIdentityService } from "@/lib/services";
import FeatureUnavailable from "@/components/FeatureUnavailable";
import { redirect } from "next/navigation";
import { createSubjectAction, deleteSubjectAction } from "./actions";
import { BookOpen } from "lucide-react";

export default async function SubjectsPage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) redirect("/");

    if (!isProductivityDbEnabled()) return <FeatureUnavailable />;

    const discordId = (session.user as any).id;
    const identityService = getIdentityService();
    const userId = await identityService.resolveIdentity('discord', discordId).then(r => r.userId);
    
    let subjects: any[] = [];
    if (userId) {
        const subjectService = getSubjectService();
        subjects = await subjectService.listSubjects(userId);
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <BookOpen className="w-8 h-8 text-blue-500" />
                <h1 className="text-3xl font-bold">My Subjects</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Create Form */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Create New Subject</h2>
                    <form action={createSubjectAction} className="space-y-4">
                        <div>
                            <label className="block text-sm text-[var(--text-secondary)] mb-1">Subject Name</label>
                            <input 
                                type="text" 
                                name="name" 
                                required 
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                                placeholder="e.g., Mathematics, Computer Science"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-[var(--text-secondary)] mb-1">Color</label>
                            <input 
                                type="color" 
                                name="color" 
                                defaultValue="#3B82F6"
                                className="w-full h-10 bg-transparent cursor-pointer rounded-lg border border-white/10"
                            />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
                            Create Subject
                        </button>
                    </form>
                </div>

                {/* List */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Your Subjects</h2>
                    {subjects.length === 0 ? (
                        <p className="text-[var(--text-secondary)] text-sm">No subjects created yet.</p>
                    ) : (
                        <ul className="space-y-3">
                            {subjects.map(subject => (
                                <li key={subject.id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: subject.color || '#3B82F6' }}></div>
                                        <span className="font-medium text-white">{subject.name}</span>
                                    </div>
                                    <form action={async () => {
                                        "use server";
                                        await deleteSubjectAction(subject.id);
                                    }}>
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
