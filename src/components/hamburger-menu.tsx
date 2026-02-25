"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type HamburgerMenuProps = {
  onOpenLocations?: () => void;
  onOpenTags?: () => void;
};

export function HamburgerMenu({
  onOpenLocations = () => {},
  onOpenTags = () => {},
}: HamburgerMenuProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="開啟選單"
          className="inline-flex h-9 w-9 items-center justify-center rounded border"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64">
        <SheetHeader>
          <SheetTitle>選單</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          <Link
            href="/stock/items"
            className="rounded px-3 py-2 text-sm hover:bg-accent"
          >
            品項管理
          </Link>
          <button
            onClick={onOpenLocations}
            className="rounded px-3 py-2 text-left text-sm hover:bg-accent"
          >
            存放點管理
          </button>
          <button
            onClick={onOpenTags}
            className="rounded px-3 py-2 text-left text-sm hover:bg-accent"
          >
            標籤管理
          </button>
          <hr className="my-2" />
          <button
            onClick={handleLogout}
            className="rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
          >
            登出
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
