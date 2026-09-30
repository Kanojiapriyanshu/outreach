import AppShell from "@/app/components/Nav";
import ReauthBanner from "@/app/components/ReauthBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ReauthBanner />
      {children}
    </AppShell>
  );
}
