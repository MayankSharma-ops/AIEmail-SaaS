'use server';

import { streamText } from 'ai';
import { createStreamableValue } from 'ai/rsc';
import { geminiTextModel } from '@/lib/gemini';

export async function generate(input: string) {
    const stream = createStreamableValue('');

    console.log("input", input);
    (async () => {
        const { textStream } = await streamText({
            model: geminiTextModel(),
            prompt: `
            You are a helpful AI embedded in a email client app that is used to answer questions about the emails in the inbox.
            ${input}
            `,
        });

        for await (const delta of textStream) {
            stream.update(delta);
        }

        stream.done();
    })();

    return { output: stream.value };
}
