// Server-only Twilio alerts. Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM_NUMBER and ALERT_TO_NUMBER from the environment (.env.local);
// never import this from a client component.
import twilio from "twilio";

export type AlertKind = "test" | "fall";

const MESSAGES: Record<AlertKind, string> = {
  test: "TEST: Fall detected. Please check on them.",
  fall: "A fall was detected. Please check on them.",
};

// Each alert places a real call and SMS, so don't let repeats pile them up.
const COOLDOWN_MS: Record<AlertKind, number> = { test: 30_000, fall: 60_000 };
const lastSentAt: Record<AlertKind, number> = { test: 0, fall: 0 };

const ENV_NAMES = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "ALERT_TO_NUMBER",
] as const;

// Trial accounts can't send custom content inline: a call may only fetch its
// instructions from a URL (so the message is spoken via Twilio's Twimlets
// service, which also works after upgrading), and an SMS body must name a
// predefined template, so the text uses Twilio's sample wording until then.
// https://www.twilio.com/docs/usage/trials/try-out-voice
// https://www.twilio.com/docs/usage/trials/try-out-sms
const TRIAL_SMS_TEMPLATE = "sms_internal_alerts";

/** A public URL that returns TwiML saying `message`. */
function sayUrl(message: string): string {
  return `https://twimlets.com/message?${new URLSearchParams({ "Message[0]": message })}`;
}

// A full international number. This also rules out emergency numbers
// (911, 112, 999, ...), which alerts must never go to.
const E164 = /^\+[1-9]\d{7,14}$/;

/** Misconfiguration: nothing was sent. */
export class AlertConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertConfigError";
  }
}

export type AlertOutcome = { ok: true; sid: string } | { ok: false; error: string };

export interface AlertResult {
  call: AlertOutcome;
  sms: AlertOutcome;
  /** Sent from a trial account, so the SMS has Twilio's sample wording instead of the message. */
  trial: boolean;
}

function getConfig() {
  const missing = ENV_NAMES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new AlertConfigError(`Missing ${missing.join(", ")} in .env.local (see README).`);
  }
  const [accountSid, authToken, from, to] = ENV_NAMES.map((name) => process.env[name]!.trim());
  for (const [name, value] of [["TWILIO_FROM_NUMBER", from], ["ALERT_TO_NUMBER", to]]) {
    if (!E164.test(value)) {
      throw new AlertConfigError(`${name} must be a full phone number with country code, like +15551234567.`);
    }
  }
  if (from === to) {
    throw new AlertConfigError(
      "TWILIO_FROM_NUMBER is the same as ALERT_TO_NUMBER. Use the Twilio number shown on Try out SMS in the Twilio Console (see README).",
    );
  }
  return { accountSid, authToken, from, to };
}

function outcome(result: PromiseSettledResult<{ sid: string }>): AlertOutcome {
  if (result.status === "fulfilled") return { ok: true, sid: result.value.sid };
  const err: unknown = result.reason;
  const message = err instanceof Error ? err.message : String(err);
  // Twilio's RestException carries a numeric code (e.g. 21608: unverified number on a trial account).
  const code = (err as { code?: unknown } | null)?.code;
  return { ok: false, error: typeof code === "number" ? `${message} (Twilio error ${code})` : message };
}

/**
 * Call and text ALERT_TO_NUMBER with `message` (on a trial account the SMS
 * has Twilio's sample wording instead). The call and the SMS are sent
 * independently, so one can succeed while the other fails. Throws
 * AlertConfigError if the environment isn't set up.
 */
export async function triggerAlert(message: string): Promise<AlertResult> {
  const { accountSid, authToken, from, to } = getConfig();
  const client = twilio(accountSid, authToken);

  // If the lookup fails, send normally; Twilio's error then says what's wrong.
  const trial = await client.api.v2010
    .accounts(accountSid)
    .fetch()
    .then((account) => account.type === "Trial")
    .catch(() => false);

  const [call, sms] = await Promise.allSettled([
    client.calls.create({ to, from, url: sayUrl(message) }),
    client.messages.create({ to, from, body: trial ? TRIAL_SMS_TEMPLATE : message }),
  ]);
  return { call: outcome(call), sms: outcome(sms), trial };
}

/**
 * Route handler body: send the `kind` alert to ALERT_TO_NUMBER, at most once
 * per cooldown. The recipient and message are fixed server-side.
 */
export async function alertResponse(kind: AlertKind): Promise<Response> {
  const wait = lastSentAt[kind] + COOLDOWN_MS[kind] - Date.now();
  if (wait > 0) {
    return Response.json(
      { message: `An alert was just sent. Wait ${Math.ceil(wait / 1000)} s before sending another.` },
      { status: 429 },
    );
  }
  lastSentAt[kind] = Date.now();

  try {
    return Response.json(await triggerAlert(MESSAGES[kind]));
  } catch (err) {
    lastSentAt[kind] = 0; // Nothing was sent, so allow an immediate retry.
    if (err instanceof AlertConfigError) {
      return Response.json({ message: err.message }, { status: 500 });
    }
    console.error("[alert]", err);
    return Response.json({ message: "Alert failed" }, { status: 500 });
  }
}
