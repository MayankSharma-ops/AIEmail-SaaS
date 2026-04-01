import { embed } from "ai";
import { google } from "@ai-sdk/google";

export async function getEmbeddings(text: string) {
    try {
        const { embedding } = await embed({
            model: google.textEmbeddingModel("text-embedding-004"),
            value: text.replace(/\n/g, " "),
        });
        return embedding;
    } catch (error) {
        console.log("error calling google embeddings api", error);
        throw error;
    }
}
