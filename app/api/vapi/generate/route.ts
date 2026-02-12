import Groq from "groq-sdk";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      type,
      role,
      level,
      techstack,
      amount,
      userid,
      transcript,
      interviewId,
    } = body;

    console.log("POST /api/vapi/generate");
    console.log("BODY:", body);

    // ✅ Required validation
    if (!userid || !interviewId) {
      return Response.json(
        {
          success: false,
          message: "User ID and Interview ID are required.",
        },
        { status: 400 }
      );
    }

    /**
     * =========================================================
     * CASE 1 → TRANSCRIPT RECEIVED AFTER CALL
     * =========================================================
     */
    if (transcript) {
      await db.collection("interviews").doc(interviewId).update({
        transcript,
        callCompleted: true,
        updatedAt: new Date().toISOString(),
      });

      return Response.json(
        { success: true, id: interviewId },
        { status: 200 }
      );
    }

    /**
     * =========================================================
     * CASE 2 → UPDATE INTERVIEW DETAILS BEFORE GENERATION
     * =========================================================
     */
    if (role || level || techstack || amount) {
      const updateData: any = {};

      if (role) updateData.role = role;
      if (level) updateData.level = level;
      if (type) updateData.type = type;
      if (techstack)
        updateData.techstack = techstack
          .split(",")
          .map((t: string) => t.trim());
      if (amount) updateData.amount = amount;

      updateData.updatedAt = new Date().toISOString();

      await db.collection("interviews").doc(interviewId).update(updateData);
    }

    /**
     * =========================================================
     * CASE 3 → GENERATE INTERVIEW QUESTIONS
     * =========================================================
     */
    if (!role || !techstack || !amount) {
      return Response.json(
        {
          success: false,
          message:
            "Missing required fields: role, techstack, amount.",
        },
        { status: 400 }
      );
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You generate interview questions in JSON array format only.",
        },
        {
          role: "user",
          content: `
Prepare ${amount} interview questions.

Role: ${role}
Level: ${level ?? "Not specified"}
Tech stack: ${techstack}
Focus: ${type ?? "Mixed"}

Return ONLY valid JSON array like:
["Question 1", "Question 2"]
          `,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const text =
      completion.choices[0]?.message?.content || "[]";

    let parsedQuestions: string[] = [];

    try {
      parsedQuestions = JSON.parse(
        text.replace(/```json|```/g, "").trim()
      );
    } catch {
      parsedQuestions = ["Tell me about yourself."];
    }

    // ✅ Update same interview document (NO new document)
    await db.collection("interviews").doc(interviewId).update({
      questions: parsedQuestions,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      updatedAt: new Date().toISOString(),
    });

    return Response.json(
      { success: true, id: interviewId },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Route error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
