import { streamText } from 'ai';
import { geminiTextModel } from '@/lib/gemini';

export async function POST(req: Request) {
    // extract the prompt from the body
    const { prompt } = await req.json();

    const result = await streamText({
        model: geminiTextModel(),
        system: `You are a helpful AI embedded in a notion text editor app that is used to autocomplete sentences
            The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
        AI is a well-behaved and well-mannered individual.
        AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful responses to the user.`,
        prompt: `
        I am writing a piece of text in a notion text editor app.
        Help me complete my train of thought here: ##${prompt}##
        keep the tone of the text consistent with the rest of the text.
        keep the response short and sweet.
        `
    });
    
    return result.toDataStreamResponse();
}
