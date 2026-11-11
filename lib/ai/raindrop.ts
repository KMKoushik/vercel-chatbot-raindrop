import * as ai from "ai";
import { createRaindropAISDK } from "@raindrop-ai/ai-sdk";

/**
 * Raindrop observability. Every chat turn is sent as a `chat_message` event with its trace (model calls, tool calls
 * and tool results). Without RAINDROP_WRITE_KEY nothing is sent.
 */
export const raindrop = createRaindropAISDK({
  writeKey: process.env.RAINDROP_WRITE_KEY,
});

export const { streamText } = raindrop.wrap(ai, {
  context: { eventName: "chat_message" },
  nativeTelemetry: true,
});
