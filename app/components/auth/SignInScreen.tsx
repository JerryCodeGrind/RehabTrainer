"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BTN_SECONDARY, Spinner } from "../rehab/ui";
import { Wordmark } from "../shell/Brand";

// NextAuth sends errors back to the sign-in page as ?error=<code>.
const ERRORS: Record<string, string> = {
  OAuthSignin: "we couldn't start google sign-in. try again in a moment.",
  OAuthCallback: "google didn't finish signing you in. try again.",
  OAuthAccountNotLinked: "that email is already linked to a different sign-in method.",
  AccessDenied: "sign-in was cancelled or access was denied.",
  Configuration: "sign-in isn't configured correctly on the server.",
  Callback: "something went wrong after google sent you back. try again.",
};

/** Google's own "G" mark, as published in its sign-in branding assets. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * First screen: Google sign-in. Without server credentials the button is
 * disabled, the screen says what's missing, and people can still use the
 * app on this device without an account (nothing pretends to sign them in).
 */
export function SignInScreen({
  googleConfigured,
  error,
  onContinueWithoutAccount,
}: {
  googleConfigured: boolean;
  error: string | null;
  onContinueWithoutAccount: () => void;
}) {
  const [pending, setPending] = useState(false);
  const message = error ? (ERRORS[error] ?? "sign-in didn't work. try again.") : null;

  const start = () => {
    setPending(true);
    // Redirects to Google; the page unloads on success.
    void signIn("google", { callbackUrl: "/" }).catch(() => setPending(false));
  };

  return (
    <main className="flex min-h-svh flex-col bg-surface px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),5rem)] sm:pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center gap-8 py-8">
        <Wordmark />

        <h1 className="text-page font-semibold tracking-tight text-ink">your rehabilitation, more personalized.</h1>

        <div className="flex flex-col gap-3">
          {message ? (
            <p role="alert" className="animate-fade-in rounded-[var(--radius-button)] bg-danger-tint px-4 py-3 text-sm text-danger">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            onClick={start}
            disabled={!googleConfigured || pending}
            aria-busy={pending}
            className="press keep-case inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[var(--radius-button)] border border-line-strong bg-surface px-5 text-[0.95rem] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-55"
          >
            {pending ? <Spinner className="text-ink-2" /> : <GoogleG />}
            {pending ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          {!googleConfigured ? (
            <>
              <button type="button" onClick={onContinueWithoutAccount} className={`${BTN_SECONDARY} min-h-14 w-full`}>
                continue without an account
              </button>
              <details className="group text-sm text-ink-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 hover:text-ink-2">
                  google sign-in needs setup
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </summary>
                <p className="animate-fade-in pt-1 leading-relaxed">
                  add <code className="num">GOOGLE_CLIENT_ID</code>, <code className="num">GOOGLE_CLIENT_SECRET</code> and{" "}
                  <code className="num">NEXTAUTH_SECRET</code> to <code className="num">.env.local</code>.
                </p>
              </details>
            </>
          ) : null}
        </div>
      </div>

      <footer className="mx-auto w-full max-w-[26rem] text-xs leading-relaxed text-ink-3">
        rupert isn&apos;t medical advice.
      </footer>
    </main>
  );
}
