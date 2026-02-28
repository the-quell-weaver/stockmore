import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function DemoErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message =
    error === "SIGN_IN_FAILED"
      ? "無法建立試用 session，請稍後再試。"
      : error === "BOOTSTRAP_FAILED"
        ? "無法初始化試用資料，請稍後再試。"
        : error === "SEED_FAILED"
          ? "無法載入示範資料，請稍後再試。"
          : "試用模式啟動失敗，請稍後再試。";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">試用模式發生錯誤</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/demo">重試</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/sign-up">前往註冊</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
