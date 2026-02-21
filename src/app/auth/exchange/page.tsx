import { AuthExchangeClient } from "@/components/auth/auth-exchange-client";

export default async function AuthExchangePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AuthExchangeClient code={params.code ?? null} next={params.next ?? null} />
      </div>
    </div>
  );
}
