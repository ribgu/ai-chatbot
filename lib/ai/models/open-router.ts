import { openRouter as openRouterProvider } from '../providers/open-router'
import { ChatModel, ModelCategory, ModelProvider } from './index'

// Provider function for Copilot models
export const openRouter = openRouterProvider

// Copilot models
export const models: Array<ChatModel> = [
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    description: 'Open source reasoning model',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
  {
    id: 'google/gemini-2.0-flash-thinking-exp-1219:free',
    name: 'Gemini 2.0 Flash',
    description: 'Google\'s fast generative AI model',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
  {
    id: 'deepseek/deepseek-chat:free',
    name: 'DeepSeek Chat',
    description: 'Conversational AI model by DeepSeek',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
  {
    id: 'google/gemini-2.0-pro-exp-02-05:free',
    name: 'Gemini 2.0 Pro',
    description: 'Google\'s advanced generative AI model',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
  {
    id: 'google/gemini-2.0-flash-lite-preview-02-05:free',
    name: 'Gemini 2.0 Flash Lite',
    description: 'Google\'s lightweight fast generative AI model',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
  {
    id: 'google/learnlm-1.5-pro-experimental:free',
    name: 'LearnLM 1.5 Pro',
    description: 'Google\'s experimental learning-focused AI model',
    provider: 'openrouter' as ModelProvider,
    category: 'Open Router' as ModelCategory
  },
]

export const copilotModels = {
  models,
  openRouter
}
