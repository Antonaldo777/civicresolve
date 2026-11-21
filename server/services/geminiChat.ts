import { Content, GenerateContentResponse } from '@google/genai';
import {
  buildChatSystemInstruction,
  resolveChatModel,
} from '../../src/shared/chatDomain.ts';
import {
  CivicChatRequestPayload,
  CivicChatResponsePayload,
} from '../../src/shared/types.ts';
import {
  GeminiServiceError,
  getGeminiClient,
  mapGeminiError,
  withRetry,
} from './geminiClassifier.ts';

const STREAM_CONNECT_TIMEOUT_MS = 18_000;

function toSdkHistory(history: CivicChatRequestPayload['history']): Content[] {
  return history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number, model: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new GeminiServiceError(
          `Gemini (${model}) is experiencing high demand and did not respond within ${Math.round(ms / 1000)}s. Please try again shortly or switch to Fast Lite (gemini-3.1-flash-lite).`,
          503,
          'AI_UNAVAILABLE',
        ),
      );
    }, ms);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function sendCivicChatMessage(
  payload: CivicChatRequestPayload,
): Promise<CivicChatResponsePayload> {
  const ai = getGeminiClient();
  const model = resolveChatModel(Boolean(payload.fastMode));
  const systemInstruction = buildChatSystemInstruction(
    payload.rolePreset,
    payload.context,
  );
  const startedAt = Date.now();

  try {
    const chat = ai.chats.create({
      model,
      history: toSdkHistory(payload.history),
      config: {
        systemInstruction,
      },
    });

    const response: GenerateContentResponse = await withTimeout(
      withRetry(() => chat.sendMessage({ message: payload.message }), 1),
      STREAM_CONNECT_TIMEOUT_MS,
      model,
    );

    const reply = (response.text ?? '').trim();
    if (!reply) {
      throw new GeminiServiceError(
        'Gemini returned an empty response for this conversation turn.',
        502,
        'EMPTY_AI_RESPONSE',
      );
    }

    return {
      reply,
      model,
      rolePreset: payload.rolePreset,
      tokensUsed: response.usageMetadata?.totalTokenCount,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw mapGeminiError(error, model, 'chat');
  }
}

export interface StreamChatCallbacks {
  onChunk: (deltaText: string) => void;
  onDone: (meta: {
    reply: string;
    model: CivicChatResponsePayload['model'];
    rolePreset: CivicChatResponsePayload['rolePreset'];
    tokensUsed?: number;
    latencyMs: number;
  }) => void;
}

export async function streamCivicChatMessage(
  payload: CivicChatRequestPayload,
  callbacks: StreamChatCallbacks,
): Promise<void> {
  const ai = getGeminiClient();
  const model = resolveChatModel(Boolean(payload.fastMode));
  const systemInstruction = buildChatSystemInstruction(
    payload.rolePreset,
    payload.context,
  );
  const startedAt = Date.now();

  try {
    const chat = ai.chats.create({
      model,
      history: toSdkHistory(payload.history),
      config: {
        systemInstruction,
      },
    });

    const stream = await withTimeout(
      withRetry(() => chat.sendMessageStream({ message: payload.message }), 1),
      STREAM_CONNECT_TIMEOUT_MS,
      model,
    );

    let fullText = '';
    let tokensUsed: number | undefined;
    const iterator = stream[Symbol.asyncIterator]();

    while (true) {
      const nextStep = await (fullText.length === 0
        ? withTimeout(iterator.next(), STREAM_CONNECT_TIMEOUT_MS, model)
        : iterator.next());

      if (nextStep.done) break;
      const c = nextStep.value as GenerateContentResponse;
      const chunkText = c.text ?? '';
      if (chunkText) {
        fullText += chunkText;
        callbacks.onChunk(chunkText);
      }
      if (c.usageMetadata?.totalTokenCount) {
        tokensUsed = c.usageMetadata.totalTokenCount;
      }
    }

    const trimmedReply = fullText.trim();
    if (!trimmedReply) {
      throw new GeminiServiceError(
        'Gemini returned an empty response for this conversation turn.',
        502,
        'EMPTY_AI_RESPONSE',
      );
    }

    callbacks.onDone({
      reply: trimmedReply,
      model,
      rolePreset: payload.rolePreset,
      tokensUsed,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    throw mapGeminiError(error, model, 'chat');
  }
}
