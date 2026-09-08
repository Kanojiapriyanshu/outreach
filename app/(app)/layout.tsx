import Nav from "@/app/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <Nav />
      <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
