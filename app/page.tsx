import HandTask from "./components/HandTask";

export default function Home() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-950 font-sans text-zinc-50">
      <main className="flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
        <HandTask />
      </main>
    </div>
  );
}
