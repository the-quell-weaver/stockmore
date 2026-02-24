"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";

type StockSearchProps = {
  defaultQ?: string;
};

export function StockSearch({ defaultQ = "" }: StockSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 400);
  }

  return (
    <input
      type="search"
      defaultValue={defaultQ}
      onChange={handleChange}
      placeholder="搜尋品名…"
      className="h-10 w-full rounded border bg-background px-3 text-sm"
      aria-label="搜尋庫存品名"
    />
  );
}
