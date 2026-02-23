
"use server";
import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import {db} from "@/firebase/admin"
import { feedbackSchema } from "@/constants";
import { InterviewCardProps, Interview, CreateFeedbackParams, GetFeedbackByInterviewIdParams, Feedback, GetLatestInterviewsParams } from "@/types";

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});
export async function getLatestInterviews(
  params: GetLatestInterviewsParams
): Promise<Interview[] | null> {
  const { userId, limit = 20 } = params;

  const interviews = await db
    .collection("interviews")
    .orderBy("createdAt", "desc")
    .where("finalized", "==", true)
    .where("userId", "!=", userId)
    .limit(limit)
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Interview[];
}

export async function getInterviewsByUserId(
  userId: string
): Promise<Interview[] | null> {
  const interviews = await db
    .collection("interviews")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Interview[];
}

export async function getInterviewById(
  interviewId: string
): Promise<Interview | null> {
  const interview = await db
    .collection("interviews")
    .doc(interviewId)
    .get();

  if (!interview.exists) return null;

  return {
    id: interview.id,
    ...interview.data(),
  } as Interview;
}

export async function createFeedback(params: CreateFeedbackParams) {
  const { interviewId, userId, transcript, feedbackId } = params;
  try {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    const { object : {totalScore, categoryScores, strengths, areasForImprovement, finalAssessment}} = await generateObject({
      model: groq("moonshotai/kimi-k2-instruct-0905"),
      schema: feedbackSchema,
      prompt: `
        You are an AI interviewer analyzing a mock interview. Your task is to evaluate the candidate based on structured categories. Be thorough and detailed in your analysis. Don't be lenient with the candidate. If there are mistakes or areas for improvement, point them out.

        Transcript:
        ${formattedTranscript}

        Please score the candidate from 0 to 100 in the following areas. Do not add categories other than the ones provided:
        - **Communication Skills**: Clarity, articulation, structured responses.
        - **Technical Knowledge**: Understanding of key concepts for the role.
        - **Problem-Solving**: Ability to analyze problems and propose solutions.
        - **Cultural & Role Fit**: Alignment with company values and job role.
        - **Confidence & Clarity**: Confidence in responses, engagement, and clarity.
        `,
      system:
        "You are a professional interviewer analyzing a mock interview. Your task is to evaluate the candidate based on structured categories",
    });
    
     const feedback = await db.collection("feedback").add({
   interviewId,
   userId,
   totalScore, 
    categoryScores,
    strengths,
    areasForImprovement,
    finalAssessment,
    createdAt: new Date().toISOString(),
  })
  
     return { success: true, feedbackId: feedback.id };
    
  } catch (err) {
      console.error("❌ Failed to generate feedback:", err);

      return { success: false};
  }
      
} 


export async function getFeedbackByInterviewId(
  params: GetFeedbackByInterviewIdParams
): Promise<Feedback | null> {
  const { interviewId, userId } = params;

  const querySnapshot = await db
    .collection("feedback")
    .where("interviewId", "==", interviewId)
    .where("userId", "==", userId)
    .limit(1)
    .get();

  if (querySnapshot.empty) return null;

  const feedbackDoc = querySnapshot.docs[0];
  return { id: feedbackDoc.id, ...feedbackDoc.data() } as Feedback;
}

export async function getInterviewsWithFeedback(
  userId: string
): Promise<InterviewCardProps[] | null> {
  const interviews = await getInterviewsByUserId(userId);
  
  if (!interviews) return null;

  const interviewsWithFeedback = await Promise.all(
    interviews.map(async (interview) => {
      const feedback = await getFeedbackByInterviewId({
        interviewId: interview.id,
        userId,
      });
      return {
        id: interview.id,
        userId: interview.userId,
        role: interview.role,
        type: interview.type,
        techstack: interview.techstack,
        createdAt: interview.createdAt,
        feedback,
      } as InterviewCardProps;
    })
  );

  return interviewsWithFeedback;
}
