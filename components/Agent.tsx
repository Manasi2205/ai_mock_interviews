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

const Agent = ({
  userName,
  userId,
  type,
  questions,
  interviewId,
  feedbackId,
}: AgentProps) => {
  const router = useRouter();

  // ✅ SINGLE VAPI INSTANCE
  const vapiRef = useRef<any>(null);
  const startingRef = useRef(false);

  const [callStatus, setCallStatus] = useState<CallStatus>(
    CallStatus.INACTIVE
  );
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [lastMessage, setLastMessage] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ---------------- INIT VAPI (RUN ONCE) ----------------

  useEffect(() => {
    if (!vapiRef.current) {
      vapiRef.current = createVapi();
    }
  }, []);

  // ---------------- VAPI EVENTS ----------------

  useEffect(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;

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
            {
              role: message.role,
              content: message.transcript,
            },
          ]);
        }
      }
    };

    const onSpeechStart = () => setIsSpeaking(true);
    const onSpeechEnd = () => setIsSpeaking(false);

    // ✅ Ignore empty Vapi shutdown errors
    const onError = (err: any) => {
      if (!err || Object.keys(err).length === 0) return;
      console.error("❌ Vapi error:", err);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    // ✅ CLEANUP ONLY EVENTS (NOT stop())
    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  // ---------------- TRANSCRIPT STATE ----------------

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }
  }, [messages]);

  // ---------------- FEEDBACK AFTER CALL ----------------

  useEffect(() => {
    if (callStatus !== CallStatus.FINISHED) return;

    const handleGenerateFeedback = async () => {
      if (type === "generate") {
        router.push("/");
        return;
      }

      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId!,
        userId: userId!,
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        router.push("/");
      }
    };

    if (messages.length > 0) {
      handleGenerateFeedback();
    }
  }, [callStatus]);

  // ---------------- GENERATE MODE SAVE ----------------

  useEffect(() => {
    if (
      callStatus !== CallStatus.FINISHED ||
      messages.length === 0 ||
      type !== "generate"
    )
      return;

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

        console.log("✅ Transcript saved → redirect");
      } catch (err) {
        console.error("❌ Failed saving transcript:", err);
      }

      router.push("/");
    };

    sendTranscript();
  }, [callStatus]);

  // ---------------- HANDLE CALL ----------------

  const handleCall = async () => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    // ✅ prevent double start
    if (startingRef.current) return;
    startingRef.current = true;

    try {
      setCallStatus(CallStatus.CONNECTING);

      // stop only if already active
      if (callStatus === CallStatus.ACTIVE) {
        await vapi.stop();
      }

      if (type === "generate") {
        await vapi.start(
          undefined,
          undefined,
          undefined,
          process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!,
          {
            variableValues: {
              username: userName,
              userid: userId,
            },
          }
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
                content:
                  interviewerConfig.model?.messages?.[0]?.content.replace(
                    "{{questions}}",
                    formattedQuestions
                  ) || "",
              },
            ],
          },
        });
      }
    } catch (err) {
      console.error("❌ Failed to start Vapi:", err);
      setCallStatus(CallStatus.INACTIVE);
    } finally {
      startingRef.current = false;
    }
  };

  const handleDisconnect = async () => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    console.log("🛑 Manual disconnect");
    await vapi.stop();
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