"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { use } from "react";
import { supabaseClient } from "@/lib/supabase-client";

interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  read: boolean;
  delivered: boolean;
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
  const [isTyping, setIsTyping] = useState(false);
  const [calling, setCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pausePollRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabVisibleRef = useRef(true);
  const visibleSinceRef = useRef(Date.now());
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("chat_user");
    if (!saved) { window.location.href = "/chat"; return; }
    setMe(JSON.parse(saved));
  }, []);

  // Track tab visibility + user interaction
  useEffect(() => {
    function onVisChange() {
      if (document.hidden) {
        tabVisibleRef.current = false;
        hasInteractedRef.current = false;
      } else {
        tabVisibleRef.current = true;
        visibleSinceRef.current = Date.now();
      }
    }
    function onInteract() {
      hasInteractedRef.current = true;
    }
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("click", onInteract);
    window.addEventListener("scroll", onInteract, true);
    window.addEventListener("keydown", onInteract);
    window.addEventListener("touchstart", onInteract);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("scroll", onInteract, true);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("touchstart", onInteract);
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    loadMessages();
    loadOtherUser();
    sendHeartbeat();
    const i = setInterval(() => {
      loadMessages();
      loadOtherUser();
      checkTyping();
    }, 800);
    const hb = setInterval(sendHeartbeat, 10000);

    // Realtime subscription for call signals
    const channel = supabaseClient
      .channel(`calls-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `to_id=eq.${me.id}` },
        (payload: any) => {
          handleCallSignal(payload.new);
        }
      )
      .subscribe();

    return () => { clearInterval(i); clearInterval(hb); supabaseClient.removeChannel(channel); };
  }, [me]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = chatContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function sendHeartbeat() {
    if (!me) return;
    fetch("/api/chat/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: me.id }),
    }).catch(() => {});
  }

  async function loadMessages() {
    if (!me || pausePollRef.current) return;
    // Only mark as read if tab visible 1.5s+ AND user has interacted
    const isReallyActive = tabVisibleRef.current && hasInteractedRef.current && (Date.now() - visibleSinceRef.current > 1500);
    const uid = isReallyActive ? me.id : "";
    const r = await fetch(`/api/chat/messages?conversationId=${conversationId}&userId=${uid}`);
    const data = await r.json();
    if (!pausePollRef.current) setMessages(data);
  }

  async function loadOtherUser() {
    if (!me) return;
    const r = await fetch(`/api/chat/conversations?userId=${me.id}`);
    const convos = await r.json();
    const convo = convos.find((c: any) => c.id === conversationId);
    if (convo?.other_user) setOtherUser(convo.other_user);
  }

  async function checkTyping() {
    if (!me) return;
    try {
      const r = await fetch(`/api/chat/typing?conversationId=${conversationId}&exclude=${me.id}`);
      const data = await r.json();
      setIsTyping(data.typing);
    } catch {}
  }

  function handleTyping() {
    if (!me) return;
    // Send typing signal
    fetch("/api/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: me.id, conversationId }),
    }).catch(() => {});

    // Debounce
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {}, 3000);
  }

  async function clearTyping() {
    if (!me) return;
    // Delete typing status by setting timestamp far in the past
    fetch("/api/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: me.id, conversationId: "_none" }),
    }).catch(() => {});
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || !me) return;
    const msg = text.trim();
    setText("");
    pausePollRef.current = true;
    clearTyping();

    const tempMsg: Message = {
      id: Date.now(), conversation_id: conversationId, sender_id: me.id,
      text: msg, file_url: null, file_type: null, file_name: null,
      read: false, delivered: false, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, senderId: me.id, text: msg }),
    });
    setTimeout(() => { pausePollRef.current = false; loadMessages(); }, 600);
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
          body: JSON.stringify({ conversationId, senderId: me.id, fileUrl: data.url, fileType: data.type, fileName: data.name }),
        });
        loadMessages();
      }
    } catch {}
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── WebRTC ──
  async function startCall(type: "audio" | "video") {
    if (!me || !otherUser) return;
    setCallType(type); setCalling(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: type === "video" });
    } catch (err) {
      alert("Could not access microphone/camera. Please allow permissions.");
      setCalling(false);
      return;
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, fromId: me.id, toId: otherUser.id, type: "ice-candidate", payload: e.candidate }) });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, fromId: me.id, toId: otherUser.id, type: "call-start", payload: { offer, callType: type } }) });
    setInCall(true);
  }

  async function answerCall(signal: any) {
    if (!me) return;
    setIncomingCall(null); setCallType(signal.payload.callType || "audio"); setInCall(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: signal.payload.callType === "video" });
    } catch (err) {
      alert("Could not access microphone/camera. Please allow permissions.");
      setInCall(false);
      return;
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, fromId: me.id, toId: signal.from_id, type: "ice-candidate", payload: e.candidate }) });
    };
    await pc.setRemoteDescription(signal.payload.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, fromId: me.id, toId: signal.from_id, type: "call-answer", payload: { answer } }) });
  }

  function endCall() {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    pcRef.current = null; localStreamRef.current = null;
    setInCall(false); setCalling(false);
    if (me && otherUser) fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, fromId: me.id, toId: otherUser.id, type: "call-end", payload: {} }) });
  }

  async function handleCallSignal(s: any) {
    if (s.type === "call-start" && !inCall) {
      setIncomingCall(s);
    } else if (s.type === "call-answer" && pcRef.current) {
      try { await pcRef.current.setRemoteDescription(s.payload.answer); } catch {}
      setCalling(false);
    } else if (s.type === "ice-candidate" && pcRef.current) {
      try { await pcRef.current.addIceCandidate(s.payload); } catch {}
    } else if (s.type === "call-end") {
      endCall();
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderTicks(msg: Message) {
    if (msg.sender_id !== me?.id) return null;
    if (msg.read) {
      return <span className="text-[#53bdeb]">&#10003;&#10003;</span>; // blue double tick
    }
    if (msg.delivered) {
      return <span className="text-[#ffffff80]">&#10003;&#10003;</span>; // grey double tick
    }
    return <span className="text-[#ffffff80]">&#10003;</span>; // single tick
  }

  function renderFile(msg: Message) {
    if (!msg.file_url) return null;
    const type = msg.file_type || "";
    if (type.startsWith("image/"))
      return <img src={msg.file_url} alt="" className="max-w-full w-auto rounded-lg mt-1 cursor-pointer" style={{ maxWidth: "min(280px, 100%)" }} onClick={() => window.open(msg.file_url!, "_blank")} />;
    if (type.startsWith("video/"))
      return <video src={msg.file_url} controls playsInline className="rounded-lg mt-1" style={{ maxWidth: "min(280px, 100%)" }} />;
    if (type.startsWith("audio/"))
      return <audio src={msg.file_url} controls className="mt-1 w-full" style={{ maxWidth: "min(280px, 100%)" }} />;
    return (
      <a href={msg.file_url} target="_blank" className="flex items-center gap-2 bg-[#ffffff15] rounded-lg p-2 mt-1 no-underline text-inherit">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div><div className="text-xs font-medium">{msg.file_name}</div><div className="text-[0.6rem] text-[#8696a0]">Tap to download</div></div>
      </a>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b141a] max-w-2xl mx-auto">
      {/* Incoming call */}
      {incomingCall && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center">
          <div className="bg-[#202c33] rounded-2xl p-8 text-center">
            <div className="w-20 h-20 bg-[#2a3942] rounded-full flex items-center justify-center text-3xl mx-auto mb-4 text-[#8696a0]">
              {otherUser?.display_name?.[0]?.toUpperCase()}
            </div>
            <h3 className="text-white text-lg font-semibold mb-1">{otherUser?.display_name}</h3>
            <p className="text-[#8696a0] text-sm mb-6">Incoming {incomingCall.payload?.callType || "audio"} call...</p>
            <div className="flex gap-6 justify-center">
              <button onClick={() => setIncomingCall(null)} className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
              </button>
              <button onClick={() => answerCall(incomingCall)} className="w-14 h-14 bg-[#00a884] rounded-full flex items-center justify-center hover:bg-[#00906f]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-call UI */}
      {inCall && (
        <div className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col items-center justify-center" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {callType === "video" ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 w-28 h-40 object-cover rounded-xl border-2 border-[#2a3942]" />
            </>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center text-4xl mx-auto mb-4 text-[#8696a0]">
                {otherUser?.display_name?.[0]?.toUpperCase()}
              </div>
              <h3 className="text-white text-xl font-semibold">{otherUser?.display_name}</h3>
              <p className="text-[#8696a0] text-sm mt-1">{calling ? "Calling..." : "In call"}</p>
              <audio ref={remoteAudioRef} autoPlay playsInline />
            </div>
          )}
          <div className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))]">
            <button onClick={endCall} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 shadow-lg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#202c33] px-4 py-2.5 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <a href="/chat" className="text-[#8696a0] no-underline hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div className="relative">
          <div className="w-10 h-10 bg-[#2a3942] rounded-full flex items-center justify-center text-lg font-bold text-[#8696a0]">
            {otherUser?.display_name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#202c33] ${otherUser?.online ? "bg-[#00a884]" : "bg-[#667781]"}`} />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-white">{otherUser?.display_name || "Loading..."}</div>
          <div className="text-[0.65rem] text-[#8696a0]">
            {isTyping ? (
              <span className="text-[#00a884]">typing...</span>
            ) : otherUser?.online ? (
              "online"
            ) : (
              "offline"
            )}
          </div>
        </div>
        <div className="flex gap-5">
          <button onClick={() => startCall("video")} className="text-[#8696a0] hover:text-white" title="Video call">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
          <button onClick={() => startCall("audio")} className="text-[#8696a0] hover:text-white" title="Voice call">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[#091519]">
        {messages.map((msg) => {
          const isMine = msg.sender_id === me?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-1.5 rounded-lg text-sm ${
                isMine ? "bg-[#005c4b] text-white rounded-tr-none" : "bg-[#202c33] text-white rounded-tl-none"
              }`}>
                {msg.text && <p className="whitespace-pre-wrap break-words m-0">{msg.text}</p>}
                {renderFile(msg)}
                <div className={`text-[0.6rem] mt-0.5 flex items-center justify-end gap-1 ${isMine ? "text-[#ffffff60]" : "text-[#8696a0]"}`}>
                  {formatTime(msg.created_at)}
                  {renderTicks(msg)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#202c33] text-[#8696a0] px-4 py-2 rounded-lg rounded-tl-none text-sm flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="inline-block w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="inline-block w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-[#202c33] px-3 py-2.5 flex items-center gap-2 shrink-0 sticky bottom-0 z-30">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-10 h-10 flex items-center justify-center text-[#8696a0] hover:text-white shrink-0">
          {uploading ? (
            <div className="w-5 h-5 border-2 border-[#8696a0] border-t-[#00a884] rounded-full animate-spin" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          )}
        </button>
        <form onSubmit={sendMessage} className="flex-1 flex gap-2">
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            placeholder="Type a message"
            className="flex-1 bg-[#2a3942] text-white border-none rounded-full px-4 py-2.5 text-sm outline-none placeholder-[#8696a0]"
          />
          <button type="submit" disabled={!text.trim()} className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white shrink-0 hover:bg-[#00906f] disabled:opacity-30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
