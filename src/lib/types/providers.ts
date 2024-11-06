import type { OpenAIProvider } from "@ai-sdk/openai"
import type { AnthropicProvider } from "@ai-sdk/anthropic"
import type { AmazonBedrockProvider } from "@ai-sdk/amazon-bedrock"
import type { CohereProvider } from "@ai-sdk/cohere"
import type { MistralProvider } from "@ai-sdk/mistral"
import type { AzureOpenAIProvider } from "@ai-sdk/azure"
import type { GroqProvider } from "@ai-sdk/groq"

export type SupportedProvider =
  | "openai"
  | "anthropic"
  | "cohere"
  | "mistral"
  | "azure"
  | "groq"
  | "bedrock"

export type SupportedModel =
  | OpenAIProvider["completion"]
  | AnthropicProvider["languageModel"]
  | CohereProvider["languageModel"]
  | MistralProvider["languageModel"]
  | AzureOpenAIProvider["languageModel"]
  | GroqProvider["languageModel"]
  | AmazonBedrockProvider["languageModel"]

export interface CliOptions {
  help?: boolean
  provider: SupportedProvider
  model?: string
  temperature?: number
  files?: string[]
  ignore?: string[]
  debug?: boolean
  concurrent?: boolean
  "rate-limit"?: number
  output?: "minimal" | "normal" | "verbose"
  unsafe?: boolean
}

export interface DocumentedFunction {
  name: string
  filePath: string
  documentation: string
}
