"use client";

import { useEffect, useRef, useState } from "react";
import { use } from "react";

interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  read: boolean;
  created_at: string;
}

interface User {
  id: string;
  username: string;
  display_name: string;
  online: boolean;
}

export default function ChatRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = use(params);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [uploading, setUploading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("chat_user");
    if (!saved) {
      window.location.href = "/chat";
      return;
    }
    setMe(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!me) return;
    loadMessages();
    loadOtherUser();
    const i = setInterval(() => {
      loadMessages();
      pollCallSignals();
    }, 1500);
    return () => clearInterval(i);
  }, [me]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    if (!me) return;
    const r = await fetch(`/api/chat/messages?conversationId=${conversationId}&userId=${me.id}`);
    const data = await r.json();
    setMessages(data);
  }

  async function loadOtherUser() {
    if (!me) return;
    const r = await fetch(`/api/chat/conversations?userId=${me.id}`);
    const convos = await r.json();
    const convo = convos.find((c: any) => c.id === conversationId);
    if (convo?.other_user) setOtherUser(convo.other_user);
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || !me) return;

    const msg = text.trim();
    setText("");

    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, senderId: me.id, text: msg }),
    });

    loadMessages();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !me) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const r = await fetch("/api/chat/upload", { method: "POST", body: formData });
      const data = await r.json();

      if (data.ok) {
        await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            senderId: me.id,
            fileUrl: data.url,
            fileType: data.type,
            fileName: data.name,
          }),
        });
        loadMessages();
      }
    } catch {}
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── WebRTC Calls ──
  async function startCall(type: "audio" | "video") {
    if (!me || !otherUser) return;
    setCallType(type);
    setCalling(true);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video",
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        fetch("/api/chat/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            fromId: me.id,
            toId: otherUser.id,
            type: "ice-candidate",
            payload: e.candidate,
          }),
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await fetch("/api/chat/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        fromId: me.id,
        toId: otherUser.id,
        type: "call-start",
        payload: { offer, callType: type },
      }),
    });

    setInCall(true);
  }

  async function answerCall(signal: any) {
    if (!me || !otherUser) return;
    setIncomingCall(null);
    setCallType(signal.payload.callType || "audio");
    setInCall(true);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: signal.payload.callType === "video",
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        fetch("/api/chat/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            fromId: me.id,
            toId: signal.from_id,
            type: "ice-candidate",
            payload: e.candidate,
          }),
        });
      }
    };

    await pc.setRemoteDescription(signal.payload.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await fetch("/api/chat/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        fromId: me.id,
        toId: signal.from_id,
        type: "call-answer",
        payload: { answer },
      }),
    });
  }

  function endCall() {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    pcRef.current = null;
    localStreamRef.current = null;
    setInCall(false);
    setCalling(false);

    if (me && otherUser) {
      fetch("/api/chat/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          fromId: me.id,
          toId: otherUser.id,
          type: "call-end",
          payload: {},
        }),
      });
    }
  }

  async function pollCallSignals() {
    if (!me) return;
    try {
      const r = await fetch(`/api/chat/call?userId=${me.id}`);
      const signals = await r.json();

      for (const s of signals) {
        if (s.type === "call-start" && !inCall) {
          setIncomingCall(s);
        } else if (s.type === "call-answer" && pcRef.current) {
          await pcRef.current.setRemoteDescription(s.payload.answer);
          setCalling(false);
        } else if (s.type === "ice-candidate" && pcRef.current) {
          await pcRef.current.addIceCandidate(s.payload);
        } else if (s.type === "call-end") {
          endCall();
        }
      }
    } catch {}
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderFile(msg: Message) {
    if (!msg.file_url) return null;
    const type = msg.file_type || "";

    if (type.startsWith("image/")) {
      return <img src={msg.file_url} alt="" className="max-w-[280px] rounded-lg mt-1 cursor-pointer" onClick={() => window.open(msg.file_url!, "_blank")} />;
    }
    if (type.startsWith("video/")) {
      return <video src={msg.file_url} controls className="max-w-[280px] rounded-lg mt-1" />;
    }
    if (type.startsWith("audio/")) {
      return <audio src={msg.file_url} controls className="mt-1 max-w-[280px]" />;
    }
    return (
      <a href={msg.file_url} target="_blank" className="flex items-center gap-2 bg-[#ffffff15] rounded-lg p-2 mt-1 no-underline text-inherit">
        <span className="text-2xl">&#128196;</span>
        <div>
          <div className="text-xs font-medium">{msg.file_name}</div>
          <div className="text-[0.6rem] text-[#8696a0]">Tap to download</div>
        </div>
      </a>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0b141a] max-w-2xl mx-auto">
      {/* Incoming call modal */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-[#202c33] rounded-2xl p-8 text-center">
            <div className="w-20 h-20 bg-[#2a3942] rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
              {otherUser?.display_name?.[0]?.toUpperCase()}
            </div>
            <h3 className="text-white text-lg font-semibold mb-1">{otherUser?.display_name}</h3>
            <p className="text-[#8696a0] text-sm mb-6">
              Incoming {incomingCall.payload?.callType || "audio"} call...
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setIncomingCall(null)}
                className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-xl hover:bg-red-600"
              >
                &#128222;
              </button>
              <button
                onClick={() => answerCall(incomingCall)}
                className="w-14 h-14 bg-[#00a884] rounded-full flex items-center justify-center text-xl hover:bg-[#00906f]"
              >
                &#128222;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-call UI */}
      {inCall && (
        <div className="fixed inset-0 z-40 bg-[#0b141a] flex flex-col items-center justify-center">
          {callType === "video" ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-4 right-4 w-32 h-44 object-cover rounded-xl border-2 border-[#2a3942]" />
            </>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
                {otherUser?.display_name?.[0]?.toUpperCase()}
              </div>
              <h3 className="text-white text-xl font-semibold">{otherUser?.display_name}</h3>
              <p className="text-[#8696a0] text-sm mt-1">{calling ? "Calling..." : "In call"}</p>
              <audio ref={remoteVideoRef as any} autoPlay />
            </div>
          )}
          <div className="absolute bottom-10 flex gap-6">
            <button
              onClick={endCall}
              className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-2xl hover:bg-red-600 shadow-lg"
            >
              &#128222;
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#202c33] px-4 py-2.5 flex items-center gap-3 shrink-0">
        <a href="/chat" className="text-[#8696a0] text-lg no-underline hover:text-white">&#8592;</a>
        <div className="w-10 h-10 bg-[#2a3942] rounded-full flex items-center justify-center text-lg font-bold text-[#8696a0]">
          {otherUser?.display_name?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-white">{otherUser?.display_name || "Loading..."}</div>
          <div className="text-[0.65rem] text-[#8696a0]">
            {otherUser?.online ? "online" : "offline"}
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => startCall("audio")} className="text-[#8696a0] hover:text-white text-xl" title="Voice call">
            &#128222;
          </button>
          <button onClick={() => startCall("video")} className="text-[#8696a0] hover:text-white text-xl" title="Video call">
            &#127909;
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ backgroundImage: "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\"><rect fill=\"%23091519\" width=\"80\" height=\"80\"/><circle fill=\"%230d1f26\" cx=\"40\" cy=\"40\" r=\"1\"/></svg>')", backgroundSize: "80px" }}>
        {messages.map((msg) => {
          const isMine = msg.sender_id === me?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${
                  isMine
                    ? "bg-[#005c4b] text-white rounded-tr-none"
                    : "bg-[#202c33] text-white rounded-tl-none"
                }`}
              >
                {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                {renderFile(msg)}
                <div className={`text-[0.6rem] mt-1 ${isMine ? "text-[#ffffff80]" : "text-[#8696a0]"} text-right`}>
                  {formatTime(msg.created_at)}
                  {isMine && (
                    <span className="ml-1">{msg.read ? "&#10003;&#10003;" : "&#10003;"}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-[#202c33] px-3 py-2.5 flex items-center gap-2 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-10 h-10 flex items-center justify-center text-[#8696a0] hover:text-white text-xl shrink-0"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-[#8696a0] border-t-[#00a884] rounded-full animate-spin" />
          ) : (
            "&#128206;"
          )}
        </button>
        <form onSubmit={sendMessage} className="flex-1 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message"
            className="flex-1 bg-[#2a3942] text-white border-none rounded-full px-4 py-2.5 text-sm outline-none placeholder-[#8696a0]"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white shrink-0 hover:bg-[#00906f] disabled:opacity-30"
          >
            &#10148;
          </button>
        </form>
      </div>
    </div>
  );
}
