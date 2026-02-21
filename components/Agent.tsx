"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { createVapi } from "@/lib/vapi.sdk";
import { interviewer as interviewerConfig } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

// ---------------- ENUMS & TYPES ----------------

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
  interviewId?: string;
  type: "generate" | "interview";
  questions?: string[];
  feedbackId?: string;
}

// ---------------- COMPONENT ----------------

const Agent = ({ userName, userId, type, questions, interviewId, feedbackId }: AgentProps) => {
  const router = useRouter();

  const vapiRef = useRef<any>(null);
  if (!vapiRef.current) vapiRef.current = createVapi();
  const vapi = vapiRef.current;

  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState(false);

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

  // ---------------- SEND TRANSCRIPT AFTER CALL ----------------
  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback");

      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId!,
        userId: userId!,
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        console.log("Error saving feedback");
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, interviewId, router, type, userId, feedbackId]);

  useEffect(() => {
    if (callStatus !== CallStatus.FINISHED) return;
    if (messages.length === 0) return;
    if (type !== "generate") return;

    const sendTranscript = async () => {
      try {
        await fetch("/api/vapi/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userid: userId,
            transcript: messages,
          }),
        });

        console.log("✅ Transcript saved → redirecting home");
        router.push("/");
      } catch (err) {
        console.error("❌ Failed to save transcript:", err);
        router.push("/");
      }
    };

    sendTranscript();
  }, [callStatus, messages, router, userId, type]);

  // ---------------- HANDLE CALL ----------------

  const handleCall = async () => {
    try {
      vapi.stop();
      setCallStatus(CallStatus.CONNECTING);

      if (type === "generate") {
        await vapi.start(
          undefined,
          undefined,
          undefined,
          process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!,
          { variableValues: { username: userName, userid: userId } }
        );
} else if (interviewerConfig) {
        const formattedQuestions =
          questions?.map((q) => `- ${q}`).join("\n") || "";

        await vapi.start({
          ...interviewerConfig,
          model: {
            ...interviewerConfig.model,
            messages: [
              {
                role: "system",
                content: (interviewerConfig.model.messages?.[0]?.content || "").replace(
                  "{{questions}}",
                  formattedQuestions
                ),
              },
            ],
          },
        });
      }
    } catch (err) {
      console.error("❌ Failed to start Vapi:", err);
      setCallStatus(CallStatus.INACTIVE);
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
            <Image src="/ai-avatar.png" alt="AI" width={65} height={54} />
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
            <p className={cn("transition-opacity duration-300 animate-fadeIn")}>
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== CallStatus.ACTIVE ? (
          <button className="btn-call" onClick={handleCall}>
            {callStatus === CallStatus.CONNECTING ? "..." : "Call"}
          </button>
        ) : (
          <button className="btn-disconnect" onClick={handleDisconnect}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
