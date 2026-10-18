"use client";

import { ArrowRight, Check, ChevronDown, FileText, RotateCcw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { MAX_PDF_BYTES } from "@/lib/ehr/limits";
import { savePlan, type CarePlan, type PlanChoice } from "@/lib/rehab/plan";
import { userId } from "@/lib/rehab/sync";
import { routineInfo } from "@/lib/rehab/routines/index";
import { SETTINGS } from "@/lib/rehab/settings";
import { Wordmark } from "../shell/Brand";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, IndeterminateBar, ProgressBar } from "./ui";

type State =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "rejected"; message: string }
  | { kind: "uploading"; file: File; sent: number }
  | { kind: "processing"; file: File }
  | { kind: "done"; plan: CarePlan }
  | { kind: "failed"; file: File; title: string; message: string }
  | { kind: "cancelled"; file: File };

const mb = (bytes: number) => {
  if (bytes < 100 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kb`;
  const v = bytes / 1024 / 1024;
  return `${v < 1 ? v.toFixed(2) : Number.isInteger(v) ? v : v.toFixed(1)} mb`;
};

function checkFile(file: File): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "that file isn't a pdf. choose a pdf of your health record.";
  if (file.size > MAX_PDF_BYTES) return `that pdf is ${mb(file.size)}. the limit is ${mb(MAX_PDF_BYTES)}.`;
  if (file.size === 0) return "that file is empty.";
  return null;
}

/**
 * Health-record upload: choose or drop a PDF, review it, upload it. Upload
 * progress is real (bytes sent); the server's reading step has no progress to
 * report, so it shows an indeterminate bar. Same API as before: POST
 * /api/ehr/plan with the PDF in form field "file".
 */
export function EhrUpload({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => xhrRef.current?.abort(), []);

  const choose = (file: File | undefined) => {
    if (!file) return;
    const problem = checkFile(file);
    setState(problem ? { kind: "rejected", message: problem } : { kind: "selected", file });
  };

  const upload = (file: File) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const body = new FormData();
    body.append("file", file);
    // Signed in, the server saves the plan under the account instead.
    body.append("userId", userId());
    setState({ kind: "uploading", file, sent: 0 });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setState({ kind: "uploading", file, sent: e.loaded / e.total });
    };
    xhr.upload.onload = () => setState({ kind: "processing", file });
    xhr.onload = () => {
      xhrRef.current = null;
      let data: (PlanChoice & { planId?: string | null; message?: string }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: handled below as a server failure.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.routines) {
        const plan: CarePlan = { ...data, planId: data.planId ?? null, fileName: file.name, createdAt: new Date().toISOString() };
        savePlan(plan);
        setState({ kind: "done", plan });
        return;
      }
      const title =
        xhr.status === 415 || xhr.status === 413
          ? "that file can't be used"
          : xhr.status === 422
            ? "we couldn't read that pdf"
            : "processing didn't finish";
      setState({ kind: "failed", file, title, message: (data?.message ?? `the server returned an error (${xhr.status}).`).toLowerCase() });
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setState({ kind: "failed", file, title: "couldn't reach the server", message: "check your connection and try again." });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setState({ kind: "cancelled", file });
    };
    xhr.open("POST", "/api/ehr/plan");
    xhr.send(body);
  };

  const cancel = () => xhrRef.current?.abort();
  const reset = () => {
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (state.kind === "uploading" || state.kind === "processing") return;
    choose(e.dataTransfer.files[0]);
  };

  const busy = state.kind === "uploading" || state.kind === "processing";
  const file = "file" in state ? state.file : null;

  if (state.kind === "done") {
    const { plan } = state;
    return (
      <section aria-live="polite" className="flex animate-fade-in flex-col items-start gap-6 rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
        <span className="flex h-14 w-14 animate-pop items-center justify-center rounded-full bg-sage-tint text-sage-ink">
          <Check className="h-7 w-7" aria-hidden />
        </span>
        {plan.routines.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="today's exercises">
            {plan.routines.map((id, i) => (
              <li key={id} className="animate-fade-in rounded-full bg-sky-tint px-3 py-1.5 text-sm text-ink" style={{ animationDelay: `${120 + i * 70}ms` }}>
                {routineInfo(id, SETTINGS).name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-button)] bg-warn-tint px-4 py-3 text-sm text-ink">no exercises today. check with your care team.</p>
        )}
        <button type="button" onClick={onComplete} className={`${BTN_PRIMARY} min-h-14 px-8`}>
          continue <ArrowRight className="nudge h-4 w-4" aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex min-h-60 flex-col items-center justify-center gap-4 rounded-[var(--radius-panel)] border border-dashed px-6 py-10 text-center transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky ${
          dragging ? "border-sky bg-sky-tint" : "border-line-strong bg-bg hover:bg-bg-2/60"
        } ${busy || file ? "cursor-default" : "cursor-pointer"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
          className="sr-only"
        />
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-brand shadow-[var(--shadow-soft)]">
          <FileText className="h-6 w-6" aria-hidden />
        </span>
        {file ? (
          <span className="flex max-w-full flex-col items-center gap-1">
            <span className="keep-case max-w-full truncate text-base font-semibold text-ink">{file.name}</span>
            <span className="num text-sm text-ink-2">{mb(file.size)}</span>
          </span>
        ) : (
          <span className="text-sm text-ink-3">pdf · {mb(MAX_PDF_BYTES)} max</span>
        )}
        {!file ? (
          <span className={`${BTN_SECONDARY} pointer-events-none`} aria-hidden>
            <Upload className="h-4 w-4" /> choose pdf
          </span>
        ) : null}
      </label>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state.kind === "rejected" ? (
          <p role="alert" className="rounded-[var(--radius-button)] border border-danger/25 bg-danger-tint px-4 py-3 text-sm leading-relaxed text-danger">
            {state.message}
          </p>
        ) : null}

        {state.kind === "uploading" ? (
          <div className="flex flex-col gap-2">
            <ProgressBar value={state.sent} label="uploading" />
          </div>
        ) : null}

        {state.kind === "processing" ? (
          <div className="flex flex-col gap-2">
            <p className="text-base text-ink">reading…</p>
            <IndeterminateBar label="processing your health record" />
          </div>
        ) : null}

        {state.kind === "failed" ? (
          <div role="alert" className="flex flex-col gap-1 rounded-[var(--radius-button)] border border-danger/25 bg-danger-tint px-4 py-3">
            <p className="text-sm font-semibold text-danger">{state.title}</p>
            <p className="text-sm leading-relaxed text-ink">{state.message}</p>
          </div>
        ) : null}

        {state.kind === "cancelled" ? <p className="text-sm text-ink-2">cancelled</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {state.kind === "selected" || state.kind === "cancelled" ? (
            <button type="button" onClick={() => upload(state.file)} className={BTN_PRIMARY}>
              upload <ArrowRight className="nudge h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {state.kind === "failed" ? (
            <button type="button" onClick={() => upload(state.file)} className={BTN_PRIMARY}>
              <RotateCcw className="h-4 w-4" aria-hidden /> try again
            </button>
          ) : null}
          {busy ? (
            <button type="button" onClick={cancel} className={BTN_SECONDARY}>
              cancel
            </button>
          ) : null}
          {file && !busy ? (
            <>
              <button type="button" onClick={() => inputRef.current?.click()} className={BTN_TERTIARY}>
                replace
              </button>
              <button type="button" onClick={reset} className={BTN_TERTIARY}>
                <X className="h-4 w-4" aria-hidden /> remove
              </button>
            </>
          ) : null}
        </div>
      </div>

      <details className="group text-sm text-ink-3">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 hover:text-ink-2">
          privacy
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <p className="animate-fade-in pt-1 leading-relaxed">
          the pdf&apos;s text is sent to openai to pick exercises. nothing is stored except the list, in this browser. not medical advice.
        </p>
      </details>
    </div>
  );
}

/** First-time setup after signing in: a two-step flow ending in the upload. */
export function OnboardingScreen({ onDone, onSkip, signedIn }: { onDone: () => void; onSkip: () => void; signedIn: boolean }) {
  const steps = [
    { label: signedIn ? "account" : "this device", done: true },
    { label: "health record", done: false },
  ];
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-5 pt-8 pb-28 sm:px-8 sm:pt-12">
      <Wordmark compact />
      <ol className="flex items-center gap-3 text-sm" aria-label="setup steps">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3" aria-current={!s.done ? "step" : undefined}>
            {i > 0 ? <span aria-hidden className="h-px w-8 bg-line-strong" /> : null}
            <span className={`flex items-center gap-2 ${s.done ? "text-ink-2" : "font-semibold text-ink"}`}>
              <span
                aria-hidden
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  s.done ? "bg-sage-tint text-sage-ink" : "bg-brand text-white"
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : " (current step)"}</span>
            </span>
          </li>
        ))}
      </ol>

      <h1 className="text-page font-semibold tracking-tight text-ink">add your health record</h1>

      <EhrUpload onComplete={onDone} />

      <button type="button" onClick={onSkip} className={`${BTN_TERTIARY} -ml-3 self-start`}>
        skip for now
      </button>
    </main>
  );
}

/** Replacing the record later, from the profile or overview. */
export function EhrUploadScreen({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pt-8 pb-28 sm:px-8 lg:pt-12">
      <h1 className="text-page font-semibold tracking-tight text-ink">new health record</h1>
      <EhrUpload onComplete={onDone} />
      {onCancel ? (
        <button type="button" onClick={onCancel} className={`${BTN_TERTIARY} -ml-3 self-start`}>
          keep current plan
        </button>
      ) : null}
    </main>
  );
}
