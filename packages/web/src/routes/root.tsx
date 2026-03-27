import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";

export function RootLayout() {
  return <Shell sidebar={<Sidebar />} />;
}
