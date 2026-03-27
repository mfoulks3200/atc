import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function RootLayout() {
  return <Shell sidebar={<Sidebar />} header={<Header />} />;
}
