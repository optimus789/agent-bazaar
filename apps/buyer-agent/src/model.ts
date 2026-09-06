import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Env } from '@bazaar/shared';

/**
 * Picks a real language model from the environment: Anthropic by default
 * (`LLM_MODEL`, e.g. claude-sonnet-5), or an OpenAI-compatible local server
 * (LM Studio serving Qwen etc.) when `LLM_BASE_URL` is set and no Anthropic
 * key is present — this is the "any open-source Qwen model" path the plan's
 * hand-off prompts assume other models can use without an Anthropic key.
 */
export function modelFromEnv(env: Env): LanguageModel {
  if (env.LLM_BASE_URL) {
    const provider = createOpenAICompatible({ baseURL: env.LLM_BASE_URL, name: 'local', apiKey: env.ANTHROPIC_API_KEY ? undefined : 'not-needed' });
    return provider.chatModel(env.LLM_MODEL);
  }
  return anthropic(env.LLM_MODEL);
}
