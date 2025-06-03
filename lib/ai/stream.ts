import { smoothStream, streamText, type StreamTextOptions } from 'ai';
import { myProvider } from './models';
import { generateUUID } from '@/lib/utils';

export function streamChatMessages(
  options: Omit<StreamTextOptions, 'model'> & { modelId: string },
) {
  return streamText({
    ...options,
    model: myProvider.languageModel(options.modelId),
    experimental_transform: smoothStream({ chunking: 'word' }),
    experimental_generateMessageId: generateUUID,
  });
}
