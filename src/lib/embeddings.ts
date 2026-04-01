import { embed } from "ai";
import {
    geminiEmbeddingModel,
    GEMINI_EMBEDDING_DIMENSION,
    GEMINI_EMBEDDING_MODEL_ID,
} from "@/lib/gemini";

function normalizeEmbedding(embedding: number[]) {
    if (embedding.length === GEMINI_EMBEDDING_DIMENSION) {
        return embedding;
    }

    if (embedding.length > GEMINI_EMBEDDING_DIMENSION) {
        return embedding.slice(0, GEMINI_EMBEDDING_DIMENSION);
    }

    return [...embedding, ...new Array(GEMINI_EMBEDDING_DIMENSION - embedding.length).fill(0)];
}

function buildDeterministicFallbackEmbedding(text: string) {
    const vector = new Array(GEMINI_EMBEDDING_DIMENSION).fill(0);
    const cleanText = text.replace(/\s+/g, " ").trim();

    for (let i = 0; i < cleanText.length; i++) {
        const code = cleanText.charCodeAt(i);
        vector[i % GEMINI_EMBEDDING_DIMENSION] += code / 255;
    }

    return vector;
}

export async function getEmbeddings(text: string) {
    const value = text.replace(/\n/g, " ");

    try {
        const { embedding } = await embed({
            model: geminiEmbeddingModel(),
            value,
        });

        return normalizeEmbedding(embedding);
    } catch (error) {
        console.log(`error calling google ${GEMINI_EMBEDDING_MODEL_ID} api`, error);
        return buildDeterministicFallbackEmbedding(value);
    }
}
