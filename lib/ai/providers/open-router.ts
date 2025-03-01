import { createOpenAI } from '@ai-sdk/openai'

export const openRouter = createOpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
})