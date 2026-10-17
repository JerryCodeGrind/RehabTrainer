import { alertResponse } from "@/lib/alert/server";

// Fall alarm: calls and texts ALERT_TO_NUMBER that a fall was detected.
export async function POST() {
  return alertResponse("fall");
}
