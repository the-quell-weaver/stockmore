import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-svh w-full">
      <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 py-6 md:px-6 md:py-8">
        <nav className="mb-12 flex items-center justify-between border-b pb-4 text-sm">
          <Link href="/" className="font-semibold">
            PrepStock（綢繆）
          </Link>
          <Suspense>
            <AuthButton />
          </Suspense>
        </nav>

        <section className="flex flex-1 flex-col items-start justify-center gap-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              PrepStock（綢繆）
            </h1>
            <p className="text-lg text-muted-foreground">防災物資庫存管理</p>
            <p className="text-sm text-muted-foreground md:text-base">
              管理您的防災物資，隨時掌握庫存狀況。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/stock">前往庫存</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/demo" prefetch={false}>試用 Demo</Link>
            </Button>
          </div>
        </section>

        <footer className="mt-12 flex justify-end border-t pt-4">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
