import Link from "next/link";
import { LoginPasswordFormClient } from "@/components/login-password-form-client";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm space-y-4">
        <LoginPasswordFormClient />
        <p className="text-center text-sm text-muted-foreground">
          想先試試看？{" "}
          <Link href="/demo" className="underline underline-offset-4">
            試用 Demo
          </Link>
        </p>
      </div>
    </div>
  );
}
