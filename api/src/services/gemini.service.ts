import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getSecurityFlags } from "../config/security.js";
import {
    HARDENED_SYSTEM_PROMPT,
    sanitizeModelOutput
} from "./prompt-defense.service.js";

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

const REQUEST_TIMEOUT_MS = 20000;
const PER_MODEL_TIMEOUT_MS = 8000;
const FALLBACK_CHAT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash"
];

const quotaExhaustedModels = new Set<string>();

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
const VULNERABLE_SYSTEM_PROMPT = `
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
    const flags = getSecurityFlags();
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;

    const systemInstruction = flags.promptDefense
        ? HARDENED_SYSTEM_PROMPT
        : VULNERABLE_SYSTEM_PROMPT;

    const allCandidates = [
        env.chatModel,
        ...FALLBACK_CHAT_MODELS.filter((m) => m !== env.chatModel)
    ];

    const modelsToTry = allCandidates.filter(
        (m) => !quotaExhaustedModels.has(m)
    );

    if (modelsToTry.length === 0) {
        modelsToTry.push(...allCandidates);
    }

    let lastError: unknown;

    for (const model of modelsToTry) {
        const remainingMs = deadline - Date.now();

        if (remainingMs <= 500) {
            throw new Error("AI response timed out");
        }

        const attemptTimeoutMs = Math.min(
            PER_MODEL_TIMEOUT_MS,
            remainingMs
        );

        try {
            const response = await client.models.generateContent({
                model,

                config: {
                    systemInstruction,
                    abortSignal: AbortSignal.timeout(attemptTimeoutMs)
                },

                contents: `
      DOCUMENT CONTEXT:

      ${context}

      USER QUESTION:

      ${question}
    `
            });

            const rawText = response.text || "No answer generated.";

            return flags.promptDefense
                ? sanitizeModelOutput(rawText)
                : rawText;
        } catch (error: unknown) {
            lastError = error;
            const message =
                error instanceof Error ? error.message : String(error);

            if (
                message.includes("429") ||
                message.includes("RESOURCE_EXHAUSTED")
            ) {
                quotaExhaustedModels.add(model);
            }

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

            // Retry with fallback model if this model timed out, hit quota (429), or is overloaded (503).
            const isRetryable =
                isTimedOut ||
                message.includes("429") ||
                message.includes("RESOURCE_EXHAUSTED") ||
                message.includes("503") ||
                message.includes("UNAVAILABLE") ||
                message.toLowerCase().includes("high demand") ||
                message.toLowerCase().includes("overloaded") ||
                message.toLowerCase().includes("quota");

            if (!isRetryable) {
                throw error;
            }
        }
    }

    throw lastError;
}
