import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  type JSONSchema7,
  streamText,
  convertToModelMessages,
  type UIMessage,
} from "ai";

export const maxDuration = 30;

// Server-side guardrails; any system text the client sends is appended after these.
const SYSTEM = `You are the assistant inside rupert, a home rehab app that tracks exercises with the camera.
The app's exercises are sit-to-stand, marching in place, walk out and back, single-leg stance, and standing hip and leg stretches.
Help people use the app: setting up the camera, getting in view, what each screen shows, how exercises are counted, and fall detection (it runs only during an exercise; if someone stays down, an alarm counts down 20 seconds, then calls and texts their contact unless they press "I'm OK").
You may give general, non-personal information about these exercises.
You are not a clinician. Do not diagnose, change someone's plan, or advise on pain, medication or symptoms; tell them to follow their care team's instructions.
If someone describes a fall, chest pain, trouble breathing or another emergency, tell them to call their local emergency number now.
Keep answers short and plain; many users are older or recovering from surgery or a stroke.`;

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const aiSDKTools = { ...frontendTools(tools ?? {}) };
  const result = streamText({
    abortSignal: req.signal,
    model: openai("gpt-6-luna"),
    system: system ? `${SYSTEM}\n\n${system}` : SYSTEM,
    messages: await convertToModelMessages(messages, { tools: aiSDKTools }),
    tools: aiSDKTools,
    providerOptions: { openai: { reasoningEffort: "medium" } },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
