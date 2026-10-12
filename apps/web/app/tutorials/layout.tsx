import Footer from "@/components/Footer";
import TutorialSidebar from "@/components/TutorialSidebar";

export const metadata = {
  // A layout's own title resets the parent template, so repeat it for the tutorial pages
  title: { default: "Tutorials | Pomo Discord Bot", template: "%s | Pomo Discord Bot" },
  description: "Learn how to use Pomo, the Discord Pomodoro and study bot: timers, voice tracking, streaks, pets, garden, clans and team sessions.",
};

export default function TutorialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="site flex min-h-screen flex-col">
      <div className="site-container flex flex-1 flex-col gap-10 pb-24 pt-28 lg:flex-row lg:gap-16 lg:pt-32">
        <TutorialSidebar />

        <article className="docs-prose min-w-0 flex-1 border-[var(--site-line)] text-[15px] leading-relaxed text-[var(--site-muted)] lg:border-l lg:pl-16">
          {children}
        </article>
      </div>

      <Footer />
    </main>
  );
}
