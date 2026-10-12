import DashboardNav from "@/components/DashboardNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen px-4 pb-20 pt-24">
      <div className="relative z-10 w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 items-start">
        
        {/* Workspace Sidebar (Navigation) */}
        <aside className="w-full lg:w-64 flex-shrink-0 lg:sticky lg:top-24 z-20">
          <DashboardNav />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 w-full min-w-0">
          {children}
        </main>

        

      </div>
    </div>
  );
}
