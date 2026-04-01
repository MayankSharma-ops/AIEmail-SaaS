import { google } from "@ai-sdk/google";

export const GEMINI_TEXT_MODEL_ID = "gemini-2.5-flash";
export const GEMINI_EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const GEMINI_EMBEDDING_DIMENSION = 768;

export function geminiTextModel() {
    return google(GEMINI_TEXT_MODEL_ID);
}

export function geminiEmbeddingModel() {
    return google.textEmbeddingModel(GEMINI_EMBEDDING_MODEL_ID, {
        outputDimensionality: GEMINI_EMBEDDING_DIMENSION,
    });
}
