"use server";

import { auth, db } from "@/firebase/admin";
import { cookies } from "next/headers";
import { User, Interview, SignUpParams, SignInParams, GetLatestInterviewsParams } from "@/types";

const SESSION_DURATION = 60 * 60 * 24 * 7;



export async function setSessionCookie(idToken: string) {
  const cookieStore = await cookies();

  // Create session cookie
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION * 1000, // milliseconds
  });

  // Set cookie in the browser
  cookieStore.set("session", sessionCookie, {
    maxAge: SESSION_DURATION,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });
}

export async function signUp(params: SignUpParams) {
  const { uid, name, email } = params;

  try {
    // check if user exists in db
    const userRecord = await db.collection("users").doc(uid).get();
    if (userRecord.exists)
      return {
        success: false,
        message: "User already exists. Please sign in.",
      };

    // save user to db
    await db.collection("users").doc(uid).set({
      name,
      email,
      // profileURL,
      // resumeURL,
    });

    return {
      success: true,
      message: "Account created successfully. Please sign in.",
    };
  } catch (error: any) {
    console.error("Error creating user:", error);

    // Handle Firebase specific errors
    if (error.code === "auth/email-already-exists") {
      return {
        success: false,
        message: "This email is already in use",
      };
    }

    return {
      success: false,
      message: "Failed to create account. Please try again.",
    };
  }
}

export async function signIn(params: SignInParams) {
  const { email, idToken } = params;

  try {
    // Verify the idToken to ensure it's valid and matches the email
    const decodedToken = await auth.verifyIdToken(idToken);
    if (decodedToken.email !== email) {
      return {
        success: false,
        message: "Invalid token. Please try again.",
      };
    }

    const userRecord = await auth.getUserByEmail(email);
    if (!userRecord)
      return {
        success: false,
        message: "User does not exist. Create an account.",
      };

    await setSessionCookie(idToken);

    return {
      success: true,
      message: "Signed in successfully.",
    };
  } catch (error: any) {
    console.error("Error signing in:", error);

    return {
      success: false,
      message: "Failed to log into account. Please try again.",
    };
  }
}

export async function signOut() {
  const cookieStore = await cookies();

  cookieStore.delete("session");
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);

    // get user info from db
    const userRecord = await db
      .collection("users")
      .doc(decodedClaims.uid)
      .get();
    if (!userRecord.exists) return null;

    return {
      ...userRecord.data(),
      id: userRecord.id,
    } as User;
  } catch (error) {
    console.log(error);

    // Invalid or expired session
    return null;
  }
}

export async function getInterviewsByUserId(userId: string): Promise<Interview[] | null> {
    
  const interviews = await db.collection('interviews').where('userId', '==', userId).orderBy('createdAt', 'desc').get();

    return interviews.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Interview[];
    
}  

export async function getLatestInterviews(
  params: GetLatestInterviewsParams
): Promise<Interview[] | null> {
  const { userId, limit = 10 } = params; // Default limit to 10 if not provided

  // Fetch all finalized interviews, then filter out the user's own interviews in code
  const interviews = await db
    .collection('interviews')
    .where('finalized', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(limit * 2) // Fetch more to account for filtering
    .get();

  const filteredInterviews = interviews.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }) as Interview)
    .filter((interview) => interview.userId !== userId)
    .slice(0, limit); // Limit after filtering

  return filteredInterviews;
}


export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}
import { Timestamp } from "firebase-admin/firestore";
export async function createInterviewSession(userId: string) {
  try {
    if (!userId) {
      return { success: false, message: "User ID is required" };
    }

    const interview = {
      userId,
      role: "",
      type: "mixed",
      level: "unknown",
      techstack: [],
      questions: [],
      amount: 0,
      transcript: [],
      callCompleted: false,
      finalized: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await db.collection("interviews").add(interview);

    return {
      success: true,
      interviewId: docRef.id,
    };
  } catch (error) {
    console.error("❌ Error creating interview session:", error);
    return {
      success: false,
      message: "Failed to create interview session",
    };
  }
}
