import { QueryProvider } from "@/components/query-provider";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
