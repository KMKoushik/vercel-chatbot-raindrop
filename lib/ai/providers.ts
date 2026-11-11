import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import {
  customProvider,
  defaultSettingsMiddleware,
  gateway,
  type LanguageModel,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitleModel,
        },
      });
    })()
  : null;

/**
 * With AI_GATEWAY_API_KEY (or on Vercel) the model picker's choice runs through the AI Gateway. Without it, every
 * model call uses your own OpenAI or Anthropic key directly: CHAT_MODEL, or a default model of that provider.
 */
function directModel(): LanguageModel | null {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return null;
  }
  if (process.env.OPENAI_API_KEY) {
    // store: false sends the whole conversation each turn. With stored responses, later turns refer back to items by
    // id, which fails for OpenAI orgs with zero data retention.
    return wrapLanguageModel({
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions: { openai: { store: false } } },
      }),
      model: openai(process.env.CHAT_MODEL ?? "gpt-6-luna"),
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(process.env.CHAT_MODEL ?? "claude-sonnet-5-5");
  }
  return null;
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  return directModel() ?? gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return directModel() ?? gateway.languageModel(titleModel.id);
}
