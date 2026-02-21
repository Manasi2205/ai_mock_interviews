import Groq from "groq-sdk";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userid, transcript } = body;

    console.log("POST /api/vapi/generate HIT");
    console.log("BODY:", body);

    /**
     * =========================================================
     * VALIDATION
     * =========================================================
     */
    if (!userid || !transcript) {
      return Response.json(
        { success: false, message: "Transcript and userid required" },
        { status: 400 }
      );
    }

    console.log("🧠 Extracting interview config from transcript...");

    const conversationText = transcript
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    /**
     * =========================================================
     * STEP 1 → AI CONFIG EXTRACTION (INCLUDING TYPE)
     * =========================================================
     */
    const extract = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
You MUST return ONLY valid JSON.
No explanation. No markdown.

Interview type rules:
- "technical" → coding, SQL, system design, algorithms, tools
- "behavioral" → teamwork, leadership, conflict, HR style
- "mixed" → combination of both

Format:
{
  "role": string,
  "level": string,
  "techstack": string[],
  "amount": number,
  "type": "technical" | "behavioral" | "mixed"
}
          `,
        },
        {
          role: "user",
          content: conversationText,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    /**
     * =========================================================
     * SAFE PARSING
     * =========================================================
     */
    let config = {
      role: "Unknown role",
      level: "unknown",
      techstack: [] as string[],
      amount: 5,
      type: "mixed" as "technical" | "behavioral" | "mixed",
    };

    try {
      let raw = extract.choices[0]?.message?.content || "";

      // remove markdown
      raw = raw.replace(/```json|```/g, "").trim();

      // extract JSON safely
      const match = raw.match(/\{[\s\S]*\}/);

      if (match) {
        const parsed = JSON.parse(match[0]);

        config = {
          role: parsed.role || config.role,
          level: parsed.level || config.level,
          techstack: Array.isArray(parsed.techstack)
            ? parsed.techstack
            : [parsed.techstack].filter(Boolean),
          amount: Number(parsed.amount) || config.amount,
          type: parsed.type || config.type,
        };
      } else {
        console.log("⚠️ No JSON object found in AI response");
      }
    } catch {
      console.log("⚠️ Failed to parse extracted config → using defaults");
    }

    console.log("✅ Extracted config:", config);

    /**
     * =========================================================
     * STEP 2 → GENERATE QUESTIONS USING EXTRACTED CONFIG
     * =========================================================
     */
    console.log("🤖 Generating interview questions...");

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "Return ONLY a valid JSON array of interview questions.",
        },
        {
          role: "user",
          content: `
Generate ${config.amount} interview questions.

Role: ${config.role}
Level: ${config.level}
Interview type: ${config.type}
Tech stack: ${config.techstack.join(", ")}

Return ONLY JSON:
["Question 1", "Question 2"]
          `,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    let questions: string[] = [];

    try {
      let raw = completion.choices[0]?.message?.content || "";
      raw = raw.replace(/```json|```/g, "").trim();
      questions = JSON.parse(raw);
    } catch {
      console.log("⚠️ Failed to parse generated questions → using fallback");
      questions = ["Tell me about yourself."];
    }

    /**
     * =========================================================
     * STEP 3 → SAVE FINAL INTERVIEW
     * =========================================================
     */
    const interview = {
      role: config.role,
      type: config.type, // ⭐ dynamic type saved
      level: config.level,
      techstack: config.techstack,
      amount: config.amount,
      questions,
      transcript,
      callCompleted: true,
      finalized: true,
      userId: userid,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("interviews").add(interview);

    console.log("✅ Final AI interview saved:", docRef.id);

    return Response.json({ success: true, id: docRef.id }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Route error:", error);

    return Response.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}