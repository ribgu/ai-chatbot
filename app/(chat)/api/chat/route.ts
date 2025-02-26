import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai'

import { auth } from '@/app/(auth)/auth'
import { myProvider } from '@/lib/ai/models'
import { systemPrompt, systemPromptClaudeFrontend } from '@/lib/ai/prompts'
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/prisma/queries'
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

export const maxDuration = 60

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
    experimental_searchParams,
  }: { 
    id: string; 
    messages: Array<Message>; 
    selectedChatModel: string;
    experimental_searchParams?: {
      useScrape: boolean;
      numberOfResults: number;
    }
  } = await request.json()

  const session = await auth()

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userMessage = getMostRecentUserMessage(messages)

  if (!userMessage) {
    return new Response('No user message found', { status: 400 })
  }

  // Add search instructions if search params are included
  const modifiedMessages = [...messages]
  if (experimental_searchParams) {
    const lastUserMessage = modifiedMessages[modifiedMessages.length - 1];
    if (lastUserMessage.role === 'user') {
      // Add instructions about using search with the specific parameters
      const searchInstruction = experimental_searchParams.useScrape
        ? `Please use web search with Deep Research with scraper on this query. Analyze content from ${experimental_searchParams.numberOfResults} sources.`
        : `Please use web search to answer this query with ${experimental_searchParams.numberOfResults} sources.`
      
      // Modify the last user message to include search instructions
      lastUserMessage.content = `${searchInstruction}\n\n${lastUserMessage.content}`
    }
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
      const result = streamText({
        model: myProvider.languageModel(selectedChatModel),
        system:
          selectedChatModel === 'claude-frontend'
          ? systemPromptClaudeFrontend({ selectedChatModel })
          : systemPrompt({ selectedChatModel }),
        messages: modifiedMessages,
        maxSteps: 5,
        experimental_activeTools:
          selectedChatModel === 'chat-model-reasoning'
            ? []
            : [
              'getWeather',
              'search',
              'createDocument',
              'updateDocument',
              'requestSuggestions',
            ],
        experimental_transform: smoothStream({ chunking: 'word' }),
        experimental_generateMessageId: generateUUID,
        tools: {
          getWeather,
          search,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({
            session,
            dataStream,
          }),
        },
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
                  // Transform content to match InputJsonValue type
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
    onError: () => {
      return 'Oops, an error occured!'
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
