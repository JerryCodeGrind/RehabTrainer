import { alertResponse } from "@/lib/alert/server";

// "Test Alert" button: calls and texts ALERT_TO_NUMBER with a test message.
export async function POST() {
  return alertResponse("test");
}
