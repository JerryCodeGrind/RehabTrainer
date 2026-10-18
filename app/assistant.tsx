"use client";

import { AssistantRuntimeProvider, AuiConfig, Suggestions } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";

const config = AuiConfig({
  suggestions: Suggestions([
    { title: "camera setup", label: "getting my whole body in view", prompt: "How should I set up my camera so my whole body is in view?" },
    { title: "rep counting", label: "how sit-to-stand is counted", prompt: "How does the app count a sit-to-stand repetition?" },
    { title: "demo mode", label: "trying it without a camera", prompt: "How do I try an exercise in demo mode?" },
  ]),
});

function Welcome() {
  return (
    <div className="mb-6 flex flex-col gap-2 px-2">
      <p className="text-xl font-semibold tracking-tight text-ink">questions about the app?</p>
      <p className="text-sm leading-relaxed text-ink-2">
        ask about setting up the camera, the exercises, or what a screen shows. this can&apos;t give medical advice; for that,
        ask your care team.
      </p>
    </div>
  );
}

export const Assistant = () => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <div className="h-full">
        <Thread components={{ Welcome }} />
      </div>
    </AssistantRuntimeProvider>
  );
};
