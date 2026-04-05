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
  reply_to_id: number | null;
  reply_to_text: string | null;
  reply_to_sender: string | null;
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
  const [muted, setMuted] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // remoteVideoRef/remoteAudioRef removed — using callback refs + remoteStreamRef instead
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const pausePollRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabVisibleRef = useRef(true);
  const visibleSinceRef = useRef(Date.now());
  const prevMsgCountRef = useRef(-1);
  const handleCallSignalRef = useRef<(s: any) => void>(() => {});
  const hasInteractedRef = useRef(false);

  // Sound refs — single Audio element per sound, reused
  const soundsRef = useRef<{ message: HTMLAudioElement; ringtone: HTMLAudioElement; calling: HTMLAudioElement; endcall: HTMLAudioElement } | null>(null);

  // Initialize sounds once
  useEffect(() => {
    soundsRef.current = {
      message: new Audio("/sounds/message.wav"),
      ringtone: new Audio("/sounds/ringtone.wav"),
      calling: new Audio("/sounds/calling.wav"),
      endcall: new Audio("/sounds/endcall.wav"),
    };
    soundsRef.current.ringtone.loop = true;
    soundsRef.current.calling.loop = true;
    soundsRef.current.endcall.loop = false;
    soundsRef.current.message.loop = false;
    soundsRef.current.message.volume = 0.5;
    soundsRef.current.ringtone.volume = 0.7;
    soundsRef.current.calling.volume = 0.5;
    soundsRef.current.endcall.volume = 0.5;

    return () => {
      if (soundsRef.current) {
        Object.values(soundsRef.current).forEach(a => { a.pause(); a.currentTime = 0; });
      }
    };
  }, []);

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

  function playMessageSound() {
    if (!soundsRef.current) return;
    const s = soundsRef.current.message;
    s.currentTime = 0;
    s.play().catch(() => {});
  }

  function startCallingSound() {
    stopCallingSound();
    if (!soundsRef.current) return;
    const s = soundsRef.current.calling;
    s.currentTime = 0;
    s.play().catch(() => {});
  }

  function stopCallingSound() {
    if (!soundsRef.current) return;
    soundsRef.current.calling.pause();
    soundsRef.current.calling.currentTime = 0;
  }

  function playRingtone() {
    stopRingtone();
    if (!soundsRef.current) return;
    const s = soundsRef.current.ringtone;
    s.currentTime = 0;
    s.play().catch(() => {});
  }

  function stopRingtone() {
    if (!soundsRef.current) return;
    soundsRef.current.ringtone.pause();
    soundsRef.current.ringtone.currentTime = 0;
  }

  // Play sound on new message from other user
  useEffect(() => {
    if (!me || messages.length === 0) return;
    const otherMsgs = messages.filter((m) => m.sender_id !== me.id);
    if (prevMsgCountRef.current === -1) {
      // First load — just set the count, don't play sound
      prevMsgCountRef.current = otherMsgs.length;
      return;
    }
    if (otherMsgs.length > prevMsgCountRef.current) {
      playMessageSound();
    }
    prevMsgCountRef.current = otherMsgs.length;
  }, [messages, me]);

  useEffect(() => {
    if (!me) return;
    loadMessages();
    loadOtherUser();
    sendHeartbeat();
    const i = setInterval(() => {
      loadMessages();
      loadOtherUser();
      checkTyping();
      pollCallSignalsFallback();
    }, 800);
    const hb = setInterval(sendHeartbeat, 10000);

    // Realtime subscription for call signals
    const channel = supabaseClient
      .channel(`calls-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `to_id=eq.${me.id}` },
        (payload: any) => {
          processSignal(payload.new);
        }
      )
      .subscribe();

    return () => {
      clearInterval(i); clearInterval(hb); supabaseClient.removeChannel(channel);
      stopCallingSound(); stopRingtone();
    };
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

    const replyData = replyTo ? {
      replyToId: replyTo.id,
      replyToText: replyTo.text || (replyTo.file_name ? `[${replyTo.file_type?.split("/")[0] || "file"}]` : ""),
      replyToSender: replyTo.sender_id === me.id ? me.display_name : otherUser?.display_name || "",
    } : {};

    const tempMsg: Message = {
      id: Date.now(), conversation_id: conversationId, sender_id: me.id,
      text: msg, file_url: null, file_type: null, file_name: null,
      read: false, delivered: false, created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id || null, reply_to_text: replyData.replyToText || null, reply_to_sender: replyData.replyToSender || null,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setReplyTo(null);

    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, senderId: me.id, text: msg, ...replyData }),
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
    setCallType(type); setCalling(true); setMuted(false);
    startCallingSound();
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
      remoteStreamRef.current = e.streams[0];
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
    setIncomingCall(null); stopRingtone(); setCallType(signal.payload.callType || "audio"); setInCall(true); setMuted(false);
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
      remoteStreamRef.current = e.streams[0];
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

  const endCallPlayedRef = useRef(false);

  function playEndCallSound() {
    if (endCallPlayedRef.current || !soundsRef.current) return;
    endCallPlayedRef.current = true;
    const s = soundsRef.current.endcall;
    s.currentTime = 0;
    s.play().catch(() => {});
    setTimeout(() => { endCallPlayedRef.current = false; }, 2000);
  }

  const endingCallRef = useRef(false);

  function endCall() {
    if (endingCallRef.current) return; // Prevent double calls
    endingCallRef.current = true;
    stopCallingSound();
    stopRingtone();
    if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    pcRef.current = null; localStreamRef.current = null; remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    setInCall(false); setCalling(false); setMuted(false);
    playEndCallSound();
    setTimeout(() => { endingCallRef.current = false; }, 1000);
    if (me && otherUser) fetch("/api/chat/call", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, fromId: me.id, toId: otherUser.id, type: "call-end", payload: {} }) });
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  }

  function toggleVideo() {
    if (!localStreamRef.current || !pcRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      // Already has video — toggle it
      videoTrack.enabled = !videoTrack.enabled;
      setCallType(videoTrack.enabled ? "video" : "audio");
    } else {
      // No video track — add one
      navigator.mediaDevices.getUserMedia({ video: true }).then((newStream) => {
        const newVideoTrack = newStream.getVideoTracks()[0];
        localStreamRef.current!.addTrack(newVideoTrack);
        const sender = pcRef.current!.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        } else {
          pcRef.current!.addTrack(newVideoTrack, localStreamRef.current!);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setCallType("video");
      }).catch(() => {});
    }
  }

  async function flushCandidates() {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;
    for (const c of pendingCandidatesRef.current) {
      try { await pcRef.current.addIceCandidate(c); } catch {}
    }
    pendingCandidatesRef.current = [];
  }

  async function handleCallSignal(s: any) {
    try {
      if (s.type === "call-start") {
        setIncomingCall(s);
        playRingtone();
      } else if (s.type === "call-answer") {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(s.payload.answer));
          await flushCandidates();
        }
        setCalling(false);
        stopCallingSound();
      } else if (s.type === "ice-candidate") {
        if (pcRef.current && pcRef.current.remoteDescription && s.payload) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(s.payload));
        } else if (s.payload) {
          // Queue candidate until remote description is set
          pendingCandidatesRef.current.push(new RTCIceCandidate(s.payload));
        }
      } else if (s.type === "call-end") {
        endCall();
      }
    } catch (err) {
      console.error("Call signal error:", err);
    }
  }

  // Keep ref updated so realtime subscription always has latest version
  handleCallSignalRef.current = handleCallSignal;

  // Dedup signals — track processed IDs
  const processedSignalsRef = useRef<Set<number>>(new Set());

  function processSignal(s: any) {
    if (!s.id || processedSignalsRef.current.has(s.id)) return;
    processedSignalsRef.current.add(s.id);
    // Keep set from growing forever
    if (processedSignalsRef.current.size > 100) {
      const arr = Array.from(processedSignalsRef.current);
      processedSignalsRef.current = new Set(arr.slice(-50));
    }
    handleCallSignalRef.current(s);
  }

  // Fallback polling for call signals (in case Realtime misses them)
  async function pollCallSignalsFallback() {
    if (!me) return;
    try {
      const r = await fetch(`/api/chat/call?userId=${me.id}`);
      const signals = await r.json();
      for (const s of signals) {
        processSignal(s);
      }
    } catch {}
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderTicks(msg: Message) {
    if (msg.sender_id !== me?.id) return null;
    const color = msg.read ? "#53bdeb" : "#ffffff80";
    if (msg.read || msg.delivered) {
      return (
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none" className="inline-block ml-1">
          <path d="M9.07 0.73L2.34 7.46L0.29 5.41L-0.71 6.83L2.34 10.29L10.49 2.14L9.07 0.73Z" fill={color}/>
          <path d="M15.07 0.73L8.34 7.46L7.06 6.18L5.64 7.6L8.34 10.29L16.49 2.14L15.07 0.73Z" fill={color}/>
        </svg>
      );
    }
    return (
      <svg width="12" height="11" viewBox="0 0 12 11" fill="none" className="inline-block ml-1">
        <path d="M10.07 0.73L3.34 7.46L0.71 4.83L-0.71 6.24L3.34 10.29L11.49 2.14L10.07 0.73Z" fill="#ffffff80"/>
      </svg>
    );
  }

  function renderFile(msg: Message) {
    if (!msg.file_url) return null;
    const type = msg.file_type || "";
    if (type.startsWith("image/"))
      return (
        <img src={msg.file_url} alt="" className="block rounded-lg mt-1 mb-2 cursor-pointer" style={{ maxWidth: "100%", height: "auto" }} onClick={() => window.open(msg.file_url!, "_blank")} />
      );
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
      <style>{`
        @keyframes ring-pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.5); opacity: 0; } }
        @keyframes shake { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-15deg); } 75% { transform: rotate(15deg); } }
        @keyframes slide-up { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
      {incomingCall && (
        <div className="fixed inset-0 z-[110] bg-black/85 flex items-center justify-center">
          <div className="bg-[#202c33] rounded-3xl p-8 text-center w-[280px]">
            {/* Avatar with pulsing ring */}
            <div className="relative w-24 h-24 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-[#00a884]" style={{ animation: "ring-pulse 1.5s ease-out infinite" }} />
              <div className="absolute inset-0 rounded-full bg-[#00a884]" style={{ animation: "ring-pulse 1.5s ease-out infinite 0.5s" }} />
              <div className="relative w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center text-3xl font-bold text-[#8696a0]">
                {otherUser?.display_name?.[0]?.toUpperCase()}
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-1">{otherUser?.display_name}</h3>
            <p className="text-[#8696a0] text-sm mb-8">
              {incomingCall.payload?.callType === "video" ? "Video" : "Voice"} call...
            </p>
            <div className="flex justify-center gap-12">
              {/* Reject */}
              <div className="text-center">
                <button
                  onClick={() => { setIncomingCall(null); stopRingtone(); playEndCallSound(); }}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 shadow-lg shadow-red-500/30"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
                </button>
                <span className="text-[0.65rem] text-[#8696a0] mt-2 block">Decline</span>
              </div>
              {/* Accept */}
              <div className="text-center">
                <button
                  onClick={() => answerCall(incomingCall)}
                  className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center active:bg-[#00906f] shadow-lg shadow-[#00a884]/30"
                  style={{ animation: "slide-up 1s ease-in-out infinite" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style={{ animation: "shake 0.5s ease-in-out infinite" }}><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                </button>
                <span className="text-[0.65rem] text-[#8696a0] mt-2 block">Accept</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-call UI */}
      {inCall && (
        <div className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col items-center justify-center" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {callType === "video" ? (
            <>
              <video ref={(el) => { if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current; }} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 w-28 h-40 object-cover rounded-xl border-2 border-[#2a3942]" />
            </>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center text-4xl mx-auto mb-4 text-[#8696a0]">
                {otherUser?.display_name?.[0]?.toUpperCase()}
              </div>
              <h3 className="text-white text-xl font-semibold">{otherUser?.display_name}</h3>
              <p className="text-[#8696a0] text-sm mt-1">{calling ? "Calling..." : "In call"}</p>
              <audio ref={(el) => { if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current; }} autoPlay playsInline />
            </div>
          )}
          <div className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))] flex gap-5 items-center">
            {/* Mute */}
            <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${muted ? "bg-white" : "bg-[#ffffff30]"}`}>
              {muted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>
            {/* End call */}
            <button onClick={endCall} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 shadow-lg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
            </button>
            {/* Video toggle */}
            <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${callType === "video" ? "bg-white" : "bg-[#ffffff30]"}`}>
              {callType === "video" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
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
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} group items-start gap-1`}>
              {/* Reply button - left side for own messages */}
              {isMine && (
                <button
                  onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                </button>
              )}
              <div className={`px-3 py-1.5 rounded-lg text-sm ${
                isMine ? "bg-[#005c4b] text-white rounded-tr-none" : "bg-[#202c33] text-white rounded-tl-none"
              }`} style={{ maxWidth: msg.file_url ? "min(70%, 300px)" : "75%", overflow: "hidden" }}>
                {/* Reply preview */}
                {msg.reply_to_text && (
                  <div className={`rounded-md px-2.5 py-1.5 mb-1.5 border-l-[3px] ${isMine ? "bg-[#00473d] border-[#06cf9c]" : "bg-[#1a2930] border-[#53bdeb]"}`}>
                    <div className={`text-[0.65rem] font-semibold ${isMine ? "text-[#06cf9c]" : "text-[#53bdeb]"}`}>{msg.reply_to_sender}</div>
                    <div className="text-[0.7rem] text-[#ffffff90] truncate">{msg.reply_to_text}</div>
                  </div>
                )}
                {msg.text && <p className="whitespace-pre-wrap break-words m-0">{msg.text}</p>}
                {renderFile(msg)}
                <div className={`text-[0.6rem] mt-0.5 flex items-center justify-end gap-1 ${isMine ? "text-[#ffffff60]" : "text-[#8696a0]"}`}>
                  {formatTime(msg.created_at)}
                  {renderTicks(msg)}
                </div>
              </div>
              {/* Reply button - right side for other's messages */}
              {!isMine && (
                <button
                  onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                </button>
              )}
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

      {/* Reply preview bar */}
      {replyTo && (
        <div className="bg-[#1a2530] px-4 py-2 flex items-center gap-3 border-l-4 border-[#00a884] sticky bottom-[52px] z-30">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#00a884]">
              {replyTo.sender_id === me?.id ? "You" : otherUser?.display_name}
            </div>
            <div className="text-xs text-[#8696a0] truncate">
              {replyTo.text || replyTo.file_name || "[media]"}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-[#8696a0] hover:text-white shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

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
            ref={inputRef}
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
