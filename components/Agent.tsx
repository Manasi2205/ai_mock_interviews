"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { createVapi } from "@/lib/vapi.sdk";
import { createInterviewSession } from "@/lib/actions/auth.action";

// ---------------- ENUMS ----------------

enum CallStatus {
    INACTIVE = "INACTIVE",
    CONNECTING = "CONNECTING",
    ACTIVE = "ACTIVE",
    FINISHED = "FINISHED",
}

interface SavedMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

interface AgentProps {
    userName?: string;
    userId?: string;
    type: "generate" | "interview";
    questions?: string[];
    interviewer?: string;
}

// ---------------- COMPONENT ----------------

const Agent = ({
                   userName,
                   userId,
                   type,
                   questions,
                   interviewer,
               }: AgentProps) => {
    const router = useRouter();

    // Single Vapi instance
    const vapiRef = useRef<any>(null);
    if (!vapiRef.current) vapiRef.current = createVapi();
    const vapi = vapiRef.current;

    const [callStatus, setCallStatus] = useState<CallStatus>(
        CallStatus.INACTIVE
    );
    const [messages, setMessages] = useState<SavedMessage[]>([]);
    const [lastMessage, setLastMessage] = useState<string>("");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [currentInterviewId, setCurrentInterviewId] =
        useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);

    // ---------------- VAPI EVENTS ----------------

    useEffect(() => {
        const onCallStart = () => {
            console.log("📞 Call started");
            setCallStatus(CallStatus.ACTIVE);
        };

        const onCallEnd = () => {
            console.log("📴 Call ended");
            setCallStatus(CallStatus.FINISHED);
        };

        const onMessage = (message: any) => {
            if (message.type === "transcript") {
                setLastMessage(message.transcript);

                if (message.transcriptType === "final") {
                    setMessages((prev) => [
                        ...prev,
                        { role: message.role, content: message.transcript },
                    ]);
                }
            }
        };

        const onSpeechStart = () => setIsSpeaking(true);
        const onSpeechEnd = () => setIsSpeaking(false);
        const onError = (err: any) => console.error("❌ Vapi error:", err);

        vapi.on("call-start", onCallStart);
        vapi.on("call-end", onCallEnd);
        vapi.on("message", onMessage);
        vapi.on("speech-start", onSpeechStart);
        vapi.on("speech-end", onSpeechEnd);
        vapi.on("error", onError);

        return () => {
            vapi.off("call-start", onCallStart);
            vapi.off("call-end", onCallEnd);
            vapi.off("message", onMessage);
            vapi.off("speech-start", onSpeechStart);
            vapi.off("speech-end", onSpeechEnd);
            vapi.off("error", onError);
            vapi.stop();
        };
    }, [vapi]);

    // ---------------- SAVE TRANSCRIPT AFTER CALL ----------------

    useEffect(() => {
        if (callStatus !== CallStatus.FINISHED) return;
        if (messages.length === 0) return;
        if (!currentInterviewId) {
            console.error("❌ No interviewId — cannot save transcript");
            return;
        }

        const sendTranscript = async () => {
            try {
                console.log("🚀 Sending transcript:", currentInterviewId);

                const response = await fetch("/api/vapi/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userid: userId,
                        interviewId: currentInterviewId,
                        transcript: messages,
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error("❌ API Error:", error);
                    return;
                }

                console.log("✅ Transcript saved");
                router.push("/");
            } catch (err) {
                console.error("❌ Failed to save session:", err);
            }
        };

        sendTranscript();
    }, [callStatus, messages, currentInterviewId, router, userId]);

    // ---------------- HANDLE CALL ----------------

    const handleCall = async () => {
        if (!userId) {
            console.error("❌ userId missing");
            return;
        }

        if (isInitializing || callStatus === CallStatus.CONNECTING) return;

        try {
            setIsInitializing(true);
            setCallStatus(CallStatus.CONNECTING);

            console.log("📋 Creating interview session...");

            // ✅ Create interview session FIRST
            const session = await createInterviewSession(userId);

            if (!session?.success || !session.interviewId) {
                console.error("❌ Failed to create interview session");
                setCallStatus(CallStatus.INACTIVE);
                setIsInitializing(false);
                return;
            }

            console.log("✅ Interview session created:", session.interviewId);

            setCurrentInterviewId(session.interviewId);

            // Start Vapi call
            if (type === "generate") {
                await vapi.start(
                    undefined,
                    undefined,
                    undefined,
                    process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!,
                    { variableValues: { username: userName, userid: userId } }
                );
            } else {
                const formattedQuestions =
                    questions?.map((q) => `- ${q}`).join("\n") || "";

                await vapi.start(interviewer!, {
                    variableValues: { questions: formattedQuestions },
                });
            }
        } catch (err) {
            console.error("❌ Failed to start call:", err);
            setCallStatus(CallStatus.INACTIVE);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleDisconnect = () => {
        console.log("🛑 Manual disconnect");
        vapi.stop();
        setCallStatus(CallStatus.FINISHED);
    };

    // ---------------- UI ----------------

    return (
        <>
            <div className="call-view">
                <div className="card-interviewer">
                    <div className="avatar">
                        <Image
                            src="/ai-avatar.png"
                            alt="AI"
                            width={65}
                            height={54}
                        />
                        {isSpeaking && <span className="animate-speak" />}
                    </div>
                    <h3>AI Interviewer</h3>
                </div>

                <div className="card-border">
                    <div className="card-content">
                        <Image
                            src="/user-avatar.png"
                            alt="User"
                            width={120}
                            height={120}
                            className="rounded-full"
                        />
                        <h3>{userName}</h3>
                    </div>
                </div>
            </div>

            {lastMessage && (
                <div className="transcript-border">
                    <div className="transcript">
                        <p
                            className={cn(
                                "transition-opacity duration-300 animate-fadeIn"
                            )}
                        >
                            {lastMessage}
                        </p>
                    </div>
                </div>
            )}

            <div className="w-full flex justify-center">
                {callStatus !== CallStatus.ACTIVE ? (
                    <button
                        className="btn-call"
                        onClick={handleCall}
                        disabled={isInitializing}
                    >
                        {callStatus === CallStatus.CONNECTING
                            ? "Connecting..."
                            : "Call"}
                    </button>
                ) : (
                    <button
                        className="btn-disconnect"
                        onClick={handleDisconnect}
                    >
                        End
                    </button>
                )}
            </div>
        </>
    );
};

export default Agent;
