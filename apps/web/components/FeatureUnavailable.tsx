import Link from "next/link";

export default function FeatureUnavailable({
  title = "Not available yet",
  message = "This feature needs the Pomo 2.0 database, which is not enabled on this server. Your existing data is safe — please check back later.",
  backHref = "/dashboard",
}: {
  title?: string;
  message?: string;
  backHref?: string;
}) {
  return (
    <div className="max-w-xl mx-auto mt-12 bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-gray-400 mb-6 text-sm">{message}</p>
      <Link href={backHref} className="inline-block bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2 rounded-xl transition-colors">
        Back
      </Link>
    </div>
  );
}
