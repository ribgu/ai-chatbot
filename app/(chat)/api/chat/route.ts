import {
  type Message,
  APICallError,
  NoSuchModelError,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai'

import { auth } from '@/app/(auth)/auth'
import { chatModels, myProvider } from '@/lib/ai/models'
import { systemPrompt } from '@/lib/ai/prompts/system-prompt'
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils'

import { generateTitleFromUserMessage } from '../../actions'
import { createDocument } from '@/lib/ai/tools/create-document'
import { updateDocument } from '@/lib/ai/tools/update-document'
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions'
import { getWeather } from '@/lib/ai/tools/get-weather'
import { search } from '@/lib/ai/tools/search/search'
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/prisma/queries/chat'
import { CopilotAPIError, getCopilotFallbackMessage } from '@/lib/ai/copilot/errors'

export const maxDuration = 60

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
    data,
  }: { 
    id: string 
    messages: Array<Message> 
    selectedChatModel: string
    data?: {
      useSearch: boolean
      useScrape: boolean
      numberOfResults: number
      useArtifact: boolean
    }
  } = await request.json()

  const session = await auth()

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!selectedChatModel) {
    return new Response('Chat model is required', { status: 400 })
  }

  const isKnownModel = chatModels.some((model) => model.id === selectedChatModel)

  if (!isKnownModel) {
    return new Response('Unknown chat model', { status: 400 })
  }

  const userMessage = getMostRecentUserMessage(messages)

  if (!userMessage) {
    return new Response('No user message found', { status: 400 })
  }

  const modifiedMessages = [...messages]
  
  if (data?.useSearch) {
    const searchSystemMessage: Message = {
      id: generateUUID(),
      role: 'system',
      content: 
            `IMPORTANT: Use the search tool to answer the user's question. ${
            data.useScrape
              ? 'Use deep search with content scraping to analyze complete webpage content.' 
              : 'Use basic search to find relevant information.'
          } Search for ${data.numberOfResults} sources.`,
      createdAt: new Date()
    }
    
    modifiedMessages.splice(modifiedMessages.length - 1, 0, searchSystemMessage)
  } else {
    const searchSystemMessage: Message = {
      id: generateUUID(),
      role: 'system',
      content: 'do not use search',
      createdAt: new Date()
    }
    
    modifiedMessages.splice(modifiedMessages.length - 1, 0, searchSystemMessage)
  }

  const chat = await getChatById({ id })

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage })
    await saveChat({ id, userId: session.user.id, title })
  }

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  })

  return createDataStreamResponse({
    execute: (dataStream) => {
      const activeTools: Array<'getWeather' | 'search' | 'createDocument' | 'updateDocument' | 'requestSuggestions'> = [
        'getWeather',
      ]
      
      const tools = {
        getWeather,
        ...(data?.useSearch ? { search } : {}),
        ...(data?.useArtifact ? { 
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({ session, dataStream })
        } : {})
      }

      if (data?.useSearch) activeTools.push('search')
      
      if (data?.useArtifact) activeTools.push('createDocument', 'updateDocument', 'requestSuggestions')

      const result = streamText({
        model: myProvider.languageModel(selectedChatModel),
        system: systemPrompt({ 
              selectedChatModel, 
              useArtifact: data?.useArtifact || false, 
              useSearch: data?.useSearch || false 
            }),
        messages: modifiedMessages,
        maxSteps: 5,
        experimental_activeTools:
          selectedChatModel === 'chat-model-reasoning'
            ? []
            : activeTools,
        experimental_transform: smoothStream({ chunking: 'word' }),
        experimental_generateMessageId: generateUUID,
        tools,
        onFinish: async ({ response, reasoning }) => {
          if (session.user?.id) {
            try {
              const sanitizedResponseMessages = sanitizeResponseMessages({
                messages: response.messages,
                reasoning,
              })

              await saveMessages({
                messages: sanitizedResponseMessages.map((message) => ({
                  id: message.id,
                  chatId: id,
                  role: message.role,
                  content: JSON.parse(JSON.stringify(message.content)),
                  createdAt: new Date(),
                })),
              })
            } catch {
              // Error handling
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      })

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      })
    },
    onError: (error) => {
      const { serialized, logDetails } = serializeChatStreamError(
        error,
        selectedChatModel,
      )

      console.error('Chat stream error', logDetails)

      return serialized
    },
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response('Not Found', { status: 404 })
  }

  const session = await auth()

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const chat = await getChatById({ id })
    if(!chat) {
      return new Response('Chat not found', { status: 404 })
    }

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    await deleteChatById({ id })

    return new Response('Chat deleted', { status: 200 })
  } catch {
    return new Response('An error occurred while processing your request', {
      status: 500,
    })
  }
}

type ProviderKey = 'copilot' | 'github-models'

const DEFAULT_STREAM_ERROR_MESSAGE =
  'Não foi possível concluir a solicitação. Tente novamente em instantes.'

const PROVIDER_DISPLAY_NAME: Record<ProviderKey, string> = {
  copilot: 'Copilot',
  'github-models': 'GitHub Models',
}

const PROVIDER_STATUS_TEMPLATES: Record<number, string> = {
  400: 'O {provider} considerou a solicitação inválida.',
  401: 'As credenciais informadas não foram aceitas pelo {provider}.',
  403: 'O {provider} recusou a solicitação.',
  404: 'O recurso solicitado não foi encontrado no {provider}.',
  408: 'O {provider} demorou para responder. Tente novamente.',
  409: 'O {provider} está processando outra solicitação semelhante. Aguarde e tente novamente.',
  422: 'O {provider} não conseguiu processar a solicitação enviada.',
  429: 'O {provider} atingiu o limite de requisições permitido.',
  500: 'O {provider} retornou um erro interno.',
  502: 'O {provider} enviou uma resposta inválida.',
  503: 'O {provider} está indisponível no momento. Tente novamente mais tarde.',
  504: 'O {provider} demorou para responder. Tente novamente em instantes.',
}

function serializeChatStreamError(error: unknown, modelId?: string) {
  const timestamp = new Date().toISOString()

  if (error instanceof CopilotAPIError) {
    const message = error.message || getCopilotFallbackMessage(error.status)

    return {
      serialized: createStreamErrorPayload({
        message,
        type: 'provider_error',
        statusCode: error.status,
        provider: 'copilot',
        code: error.code,
        reference: error.requestId,
        modelId,
        timestamp,
      }),
      logDetails: {
        scope: 'chat-provider',
        provider: 'copilot',
        statusCode: error.status,
        code: error.code,
        reference: error.requestId,
        modelId,
        message,
      },
    }
  }

  if (APICallError.isInstance(error)) {
    const provider = detectProvider(error.url)
    const parsed = parseProviderErrorData(error.data, error.responseBody)
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined
    const requestId = extractRequestId(error.responseHeaders)
    const providerMessage = parsed.message ?? (typeof error.message === 'string' ? error.message : undefined)
    const fallbackMessage =
      fallbackMessageForProvider(statusCode, provider) ?? DEFAULT_STREAM_ERROR_MESSAGE
    const message = providerMessage && providerMessage.trim().length > 0 ? providerMessage : fallbackMessage

    return {
      serialized: createStreamErrorPayload({
        message,
        type: 'provider_error',
        statusCode,
        provider,
        code: parsed.code,
        reference: requestId,
        modelId,
        timestamp,
      }),
      logDetails: {
        scope: 'chat-provider',
        provider,
        statusCode,
        code: parsed.code,
        reference: requestId,
        modelId,
        message,
      },
    }
  }

  if (NoSuchModelError.isInstance(error)) {
    const message =
      'O modelo selecionado não está disponível. Atualize a página e selecione outro modelo.'

    return {
      serialized: createStreamErrorPayload({
        message,
        type: 'configuration_error',
        modelId,
        timestamp,
      }),
      logDetails: {
        scope: 'chat-configuration',
        modelId,
        message,
      },
    }
  }

  if (error instanceof Error) {
    return {
      serialized: createStreamErrorPayload({
        message: DEFAULT_STREAM_ERROR_MESSAGE,
        type: 'internal_error',
        modelId,
        timestamp,
      }),
      logDetails: {
        scope: 'chat-internal',
        modelId,
        error: error.message,
        stack: error.stack,
      },
    }
  }

  return {
    serialized: createStreamErrorPayload({
      message: DEFAULT_STREAM_ERROR_MESSAGE,
      type: 'internal_error',
      modelId,
      timestamp,
    }),
    logDetails: {
      scope: 'chat-unknown',
      modelId,
      error,
    },
  }
}

function createStreamErrorPayload({
  message,
  type,
  statusCode,
  provider,
  code,
  reference,
  modelId,
  timestamp,
}: {
  message: string
  type: string
  statusCode?: number
  provider?: ProviderKey
  code?: string
  reference?: string
  modelId?: string
  timestamp: string
}) {
  const payload: Record<string, unknown> = {
    message,
    type,
    timestamp,
  }

  if (typeof statusCode === 'number') payload.statusCode = statusCode
  if (provider) payload.provider = provider
  if (code) payload.code = code
  if (reference) payload.reference = reference
  if (modelId) payload.modelId = modelId

  return JSON.stringify(payload)
}

function detectProvider(url?: string | null): ProviderKey | undefined {
  if (!url) return undefined

  const normalized = url.toLowerCase()

  if (normalized.includes('copilot')) return 'copilot'
  if (normalized.includes('models.inference.ai.azure.com')) return 'github-models'

  return undefined
}

function parseProviderErrorData(data: unknown, responseBody?: string | null) {
  const parsed = extractErrorData(data) ?? extractErrorData(safeParseErrorBody(responseBody))

  return parsed ?? {}
}

function extractErrorData(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined

  const container =
    'error' in (raw as Record<string, unknown>) &&
    typeof (raw as Record<string, unknown>).error === 'object' &&
    (raw as Record<string, unknown>).error !== null
      ? (raw as Record<string, unknown>).error as Record<string, unknown>
      : (raw as Record<string, unknown>)

  const message = typeof container.message === 'string' ? container.message : undefined
  const codeValue = container.code
  const code =
    typeof codeValue === 'string'
      ? codeValue
      : typeof codeValue === 'number'
        ? codeValue.toString()
        : undefined

  const type = typeof container.type === 'string' ? container.type : undefined

  if (!message && !code && !type) {
    return undefined
  }

  return { message, code, type }
}

function safeParseErrorBody(body?: string | null) {
  if (!body) return undefined

  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function fallbackMessageForProvider(statusCode?: number, provider?: ProviderKey) {
  if (typeof statusCode !== 'number') return undefined

  if (provider === 'copilot') {
    return getCopilotFallbackMessage(statusCode)
  }

  const template = PROVIDER_STATUS_TEMPLATES[statusCode]

  if (!template) return undefined

  const providerName = provider ? PROVIDER_DISPLAY_NAME[provider] : 'o provedor de modelos'

  return template.replace('{provider}', providerName)
}

function extractRequestId(headers?: Record<string, string>) {
  if (!headers) return undefined

  return (
    headers['x-request-id'] ??
    headers['x-github-request-id'] ??
    headers['x-ms-request-id']
  )
}

