import { createAgentUIStreamResponse } from "ai"

import { copilot } from "@/lib/ai/agent"

export const maxDuration = 60

export async function POST(request: Request) {
  const { messages } = await request.json()

  return createAgentUIStreamResponse({
    agent: copilot,
    uiMessages: messages,
  })
}
