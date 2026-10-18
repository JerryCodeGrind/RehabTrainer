import { connection } from "next/server";
import { Suspense } from "react";
import { googleConfigured } from "@/lib/auth";
import RehabApp from "./components/rehab/RehabApp";
import { AppSkeleton } from "./components/rehab/skeletons";

/** Reads the auth configuration at request time, not at build time. */
async function App({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection();
  const { error } = await searchParams;
  return <RehabApp googleConfigured={googleConfigured()} authError={typeof error === "string" ? error : null} />;
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <App searchParams={searchParams} />
    </Suspense>
  );
}
