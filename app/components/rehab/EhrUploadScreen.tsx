"use client";

import { useState, type DragEvent } from "react";
import { savePlan, type CarePlan } from "@/lib/rehab/plan";
import { userId } from "@/lib/rehab/sync";
import { BTN_GHOST_SM, Screen } from "./ui";

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
      body.append("userId", userId());
      const res = await fetch("/api/ehr/plan", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | (Omit<CarePlan, "fileName" | "createdAt"> & { message?: string })
        | null;
      if (!res.ok || !data?.routines) {
        throw new Error(data?.message ?? `Upload failed (HTTP ${res.status}).`);
      }
      savePlan({ ...data, planId: data.planId ?? null, fileName: file.name, createdAt: new Date().toISOString() });
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
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Upload your health record</h1>
        <p className="text-lg text-zinc-400">
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
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors focus-within:outline-4 focus-within:outline-offset-4 focus-within:outline-lime-400 ${
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
        <span className="text-5xl" aria-hidden>
          {busy ? "⏳" : "📄"}
        </span>
        <span className="text-2xl font-semibold" aria-live="polite">
          {busy ? "Reading your health record…" : "Choose a PDF, or drop it here"}
        </span>
        {busy ? <span className="text-base text-zinc-400">This can take up to a minute.</span> : null}
      </label>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-950 p-4 text-base text-red-100">
          {error}
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-zinc-500">
        Your record is sent to OpenAI (ChatGPT) to choose your exercises. It isn&apos;t saved: only the list of
        exercises is kept, on this device. This isn&apos;t medical advice; follow your care team&apos;s instructions.
      </p>

      {onCancel ? (
        <button onClick={onCancel} disabled={busy} className={`${BTN_GHOST_SM} self-start`}>
          ← Keep my current exercises
        </button>
      ) : null}
    </Screen>
  );
}
