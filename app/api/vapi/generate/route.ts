import {generateText} from "ai";
import { google } from "@ai-sdk/google";
import { getRandomInterviewCover } from "@/lib/utils";
import {db} from "@/firebase/admin"
export async function GET(){
    return Response.json({success:true, data: 'THANK YOU!'},{status: 200});

}

export async function POST() {
    try {
        const interview = {
            role: "Frontend Developer",
            type: "Technical",
            level: "Junior",
            techstack: ["React", "JavaScript"],
            questions: ["What is React?", "Explain hooks."],
            userId: "test-user",
            finalized: true,
            coverImage: "test.jpg",
            createdAt: new Date().toISOString(),
        };

        await db.collection("interviews").add(interview);

        return Response.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Firestore error:", error);
        return Response.json({ success: false }, { status: 500 });
    }
}
