"use client";

import { useState, type DragEvent } from "react";
import { savePlan, type PlanChoice } from "@/lib/rehab/plan";
import { BTN_GHOST, Screen } from "./ui";

/** First screen: upload the health record PDF; ChatGPT picks today's exercises from it.
 * `onCancel` offers a way back when there's already a plan. */
export function EhrUploadScreen({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ehr/plan", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as (PlanChoice & { message?: string }) | null;
      if (!res.ok || !data?.routines) {
        throw new Error(data?.message ?? `Upload failed (HTTP ${res.status}).`);
      }
      savePlan({ ...data, fileName: file.name, createdAt: new Date().toISOString() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  };

  return (
    <Screen>
      <header className="flex flex-col gap-3">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Upload your health record</h1>
        <p className="text-2xl text-zinc-300">
          Add your electronic health record (EHR) as a PDF. We&apos;ll read it and choose which exercises are right for
          you today.
        </p>
      </header>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-4 border-dashed p-8 text-center transition-colors focus-within:outline-4 focus-within:outline-offset-4 focus-within:outline-lime-400 ${
          dragging ? "border-lime-400 bg-zinc-800" : "border-zinc-600 bg-zinc-900 hover:bg-zinc-800"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => void upload(e.target.files?.[0])}
          className="sr-only"
        />
        <span className="text-6xl" aria-hidden>
          {busy ? "⏳" : "📄"}
        </span>
        <span className="text-3xl font-bold" aria-live="polite">
          {busy ? "Reading your health record…" : "Choose a PDF, or drop it here"}
        </span>
        {busy ? <span className="text-xl text-zinc-400">This can take up to a minute.</span> : null}
      </label>

      {error ? (
        <p role="alert" className="rounded-2xl bg-red-950 p-5 text-xl text-red-100">
          {error}
        </p>
      ) : null}

      <p className="text-lg text-zinc-400">
        Your record is sent to OpenAI (ChatGPT) to choose your exercises. It isn&apos;t saved: only the list of
        exercises is kept, on this device. This isn&apos;t medical advice; follow your care team&apos;s instructions.
      </p>

      {onCancel ? (
        <button onClick={onCancel} disabled={busy} className={`${BTN_GHOST} self-start`}>
          ← Keep my current exercises
        </button>
      ) : null}
    </Screen>
  );
}
