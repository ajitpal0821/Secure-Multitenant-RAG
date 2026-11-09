
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

let ai: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
    if (!env.geminiApiKey) {
        throw new Error("GEMINI_API_KEY is missing");
    }

    if (!ai) {
        ai = new GoogleGenAI({
            apiKey: env.geminiApiKey
        });
    }

    return ai;
}

// =====================================
// GENERATE EMBEDDING
// =====================================

const REQUEST_TIMEOUT_MS = 15000;
const PER_MODEL_TIMEOUT_MS = 5000;
const FALLBACK_CHAT_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite"
];

export async function embedText(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
): Promise<number[]> {
    const client = getGeminiClient();

    const response = await client.models.embedContent({
        model: env.embeddingModel,
        contents: text,
        config: {
            taskType,
            outputDimensionality: 768,
            abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
    });

    const embedding = response.embeddings?.[0]?.values;

    if (!embedding) {
        throw new Error("Gemini failed to generate embedding");
    }

    return embedding;
}

// =====================================
// GENERATE RAG ANSWER
// =====================================

// INTENTIONALLY INSECURE v0 system prompt.
// Prompt hardening will be implemented in Phase 6.

const SYSTEM_PROMPT = `
You are an AI assistant for a company knowledge base.

Answer questions using the provided document context.

If the answer is not available in the context,
say that you do not have enough information.

Be clear and concise.
`;

export async function generateAnswer(
    question: string,
    context: string
): Promise<string> {
    const client = getGeminiClient();
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;

    const modelsToTry = [
        env.chatModel,
        ...FALLBACK_CHAT_MODELS.filter((m) => m !== env.chatModel)
    ];

    let lastError: unknown;

    for (const model of modelsToTry) {
        const remainingMs = deadline - Date.now();

        if (remainingMs <= 500) {
            throw new Error("AI response timed out");
        }

        const attemptTimeoutMs = Math.min(PER_MODEL_TIMEOUT_MS, remainingMs);

        try {
            const response = await client.models.generateContent({
                model,

                config: {
                    systemInstruction: SYSTEM_PROMPT,
                    abortSignal: AbortSignal.timeout(attemptTimeoutMs)
                },

                contents: `
      DOCUMENT CONTEXT:

      ${context}

      USER QUESTION:

      ${question}
    `
            });

            return response.text || "No answer generated.";
        } catch (error: unknown) {
            lastError = error;
            const message =
                error instanceof Error ? error.message : String(error);

            const isTimedOut =
                error instanceof Error &&
                (error.name === "TimeoutError" ||
                    error.name === "AbortError");

            // If total deadline is reached, stop immediately.
            if (Date.now() >= deadline) {
                throw new Error(
                    `AI response timed out: ${message}`,
                    { cause: error }
                );
            }

            // Retry with fallback model if this model timed out or is overloaded (503).
            const isOverloaded =
                isTimedOut ||
                message.includes("503") ||
                message.includes("UNAVAILABLE") ||
                message.toLowerCase().includes("high demand") ||
                message.toLowerCase().includes("overloaded");

            if (!isOverloaded) {
                throw error;
            }
        }
    }

    throw lastError;
}
