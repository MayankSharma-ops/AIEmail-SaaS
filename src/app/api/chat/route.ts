import { streamText } from "ai";

import { NextResponse } from "next/server";
import { OramaManager } from "@/lib/orama";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionStatus } from "@/lib/razorpay-actions";
import { FREE_CREDITS_PER_DAY, PRO_CREDITS_PER_DAY } from "@/app/constants";
import { geminiTextModel } from "@/lib/gemini";

// export const runtime = "edge";

// export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { messages, accountId } = await req.json();
    if (!accountId) {
      return NextResponse.json(
        { error: "Please select an email account before asking AI." },
        { status: 400 },
      );
    }

    const account = await db.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "You do not have access to that account." },
        { status: 403 },
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 },
      );
    }

    const isSubscribed = await getSubscriptionStatus();
    const dailyCredits = isSubscribed
      ? PRO_CREDITS_PER_DAY
      : FREE_CREDITS_PER_DAY;

    const today = new Date().toDateString();
    const existingInteraction = await db.chatbotInteraction.findUnique({
      where: { userId },
      select: { day: true },
    });

    if (!existingInteraction) {
      await db.chatbotInteraction.create({
        data: {
          day: today,
          count: 0,
          userId,
        },
      });
    } else if (existingInteraction.day !== today) {
      await db.chatbotInteraction.update({
        where: { userId },
        data: {
          day: today,
          count: 0,
        },
      });
    }

    const incrementResult = await db.chatbotInteraction.updateMany({
      where: {
        userId,
        day: today,
        count: {
          lt: dailyCredits,
        },
      },
      data: {
        count: {
          increment: 1,
        },
      },
    });

    if (incrementResult.count === 0) {
      return NextResponse.json(
        { error: "Limit reached", dailyCredits, isSubscribed },
        { status: 429 },
      );
    }

    const oramaManager = new OramaManager(account.id);
    await oramaManager.initialize();

    const lastMessage = messages[messages.length - 1];

    const context = await oramaManager.vectorSearch({
      prompt: lastMessage.content,
    });
    console.log(context.hits.length + " hits found");
    // console.log(context.hits.map(hit => hit.document))

    const systemPrompt = `You are an AI email assistant embedded in an email client app. Your purpose is to help the user compose emails by answering questions, providing suggestions, and offering relevant information based on the context of their previous emails.
            THE TIME NOW IS ${new Date().toLocaleString()}
      
      START CONTEXT BLOCK
      ${context.hits.map((hit) => JSON.stringify(hit.document)).join("\n")}
      END OF CONTEXT BLOCK
      
      When responding, please keep in mind:
      - Be helpful, clever, and articulate.
      - Rely on the provided email context to inform your responses.
      - If the context does not contain enough information to answer a question, politely say you don't have enough information.
      - Avoid apologizing for previous responses. Instead, indicate that you have updated your knowledge based on new information.
      - Do not invent or speculate about anything that is not directly supported by the email context.
      - Keep your responses concise and relevant to the user's questions or the email being composed.`;

    const result = await streamText({
      model: geminiTextModel(),
      system: systemPrompt,
      messages: messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.log(error);
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}
