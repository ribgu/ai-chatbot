import { type Message, createDataStreamResponse } from 'ai';
import { streamChatMessages } from '@/lib/ai/stream';

import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts/system-prompt';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { search } from '@/lib/ai/tools/search/search';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/prisma/queries/chat';

export const maxDuration = 60;

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
    data,
  }: {
    id: string;
    messages: Array<Message>;
    selectedChatModel: string;
    data?: {
      useSearch: boolean;
      useScrape: boolean;
      numberOfResults: number;
      useArtifact: boolean;
    };
  } = await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const modifiedMessages = [...messages];

  if (data?.useSearch) {
    const searchSystemMessage: Message = {
      id: generateUUID(),
      role: 'system',
      content: `IMPORTANT: Use the search tool to answer the user's question. ${
        data.useScrape
          ? 'Use deep search with content scraping to analyze complete webpage content.'
          : 'Use basic search to find relevant information.'
      } Search for ${data.numberOfResults} sources.`,
      createdAt: new Date(),
    };

    modifiedMessages.splice(
      modifiedMessages.length - 1,
      0,
      searchSystemMessage,
    );
  } else {
    const searchSystemMessage: Message = {
      id: generateUUID(),
      role: 'system',
      content: 'do not use search',
      createdAt: new Date(),
    };

    modifiedMessages.splice(
      modifiedMessages.length - 1,
      0,
      searchSystemMessage,
    );
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  return createDataStreamResponse({
    execute: (dataStream) => {
      const activeTools: Array<
        | 'getWeather'
        | 'search'
        | 'createDocument'
        | 'updateDocument'
        | 'requestSuggestions'
      > = ['getWeather'];

      const tools = {
        getWeather,
        ...(data?.useSearch ? { search } : {}),
        ...(data?.useArtifact
          ? {
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({ session, dataStream }),
            }
          : {}),
      };

      if (data?.useSearch) activeTools.push('search');

      if (data?.useArtifact)
        activeTools.push(
          'createDocument',
          'updateDocument',
          'requestSuggestions',
        );

      const result = streamChatMessages({
        modelId: selectedChatModel,
        system: systemPrompt({
          selectedChatModel,
          useArtifact: data?.useArtifact || false,
          useSearch: data?.useSearch || false,
        }),
        messages: modifiedMessages,
        maxSteps: 5,
        experimental_activeTools:
          selectedChatModel === 'chat-model-reasoning' ? [] : activeTools,
        tools,
        onFinish: async ({ response, reasoning }) => {
          if (session.user?.id) {
            try {
              const sanitizedResponseMessages = sanitizeResponseMessages({
                messages: response.messages,
                reasoning,
              });

              await saveMessages({
                messages: sanitizedResponseMessages.map((message) => ({
                  id: message.id,
                  chatId: id,
                  role: message.role,
                  content: JSON.parse(JSON.stringify(message.content)),
                  createdAt: new Date(),
                })),
              });
            } catch {
              // Error handling
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (error) => {
      console.error(error);
      return 'Oops, an error occured!';
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });
    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
