
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
            outputDimensionality: 768
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

    const response = await client.models.generateContent({
        model: env.chatModel,

        config: {
            systemInstruction: SYSTEM_PROMPT
        },

        contents: `
      DOCUMENT CONTEXT:

      ${context}

      USER QUESTION:

      ${question}
    `
    });

    return response.text || "No answer generated.";
}
