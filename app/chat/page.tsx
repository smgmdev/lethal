"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  username: string;
  display_name: string;
  online: boolean;
  last_seen: string;
}

interface Conversation {
  id: string;
  other_user: User;
  last_message_text: string;
  last_message_at: string;
  unread: number;
}

export default function ChatPage() {
  const [stage, setStage] = useState<"login" | "list">("login");
  const [me, setMe] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("chat_user");
    if (saved) {
      const user = JSON.parse(saved);
      setMe(user);
      setStage("list");
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    loadConversations();
    loadUsers();
    const i = setInterval(() => {
      loadConversations();
      loadUsers();
    }, 3000);
    return () => clearInterval(i);
  }, [me]);

  async function login() {
    if (!username.trim() || !displayName.trim()) return;
    const r = await fetch("/api/chat/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), displayName: displayName.trim() }),
    });
    const data = await r.json();
    if (data.ok) {
      setMe(data.user);
      localStorage.setItem("chat_user", JSON.stringify(data.user));
      setStage("list");
    }
  }

  async function loadConversations() {
    if (!me) return;
    const r = await fetch(`/api/chat/conversations?userId=${me.id}`);
    const data = await r.json();
    setConversations(data);
  }

  async function loadUsers() {
    if (!me) return;
    const r = await fetch(`/api/chat/users?exclude=${me.id}`);
    const data = await r.json();
    setUsers(data);
  }

  async function startChat(otherUser: User) {
    if (!me) return;
    const r = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user1Id: me.id, user2Id: otherUser.id }),
    });
    const data = await r.json();
    if (data.ok) {
      window.location.href = `/chat/${data.conversation.id}`;
    }
  }

  function timeAgo(ts: string) {
    if (!ts) return "";
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  function logout() {
    localStorage.removeItem("chat_user");
    setMe(null);
    setStage("login");
  }

  const filteredUsers = users.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
  );

  if (stage === "login") {
    return (
      <div className="min-h-screen bg-[#111b21] flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center text-2xl mx-auto mb-4">&#128172;</div>
            <h1 className="text-2xl font-bold text-white">Chat</h1>
            <p className="text-[#8696a0] text-sm mt-1">Enter your details to start chatting</p>
          </div>
          <div className="space-y-3">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display Name"
              className="w-full bg-[#2a3942] text-white border-none rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-[#00a884] placeholder-[#8696a0]"
            />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (unique)"
              className="w-full bg-[#2a3942] text-white border-none rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-[#00a884] placeholder-[#8696a0]"
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
            <button
              onClick={login}
              disabled={!username.trim() || !displayName.trim()}
              className="w-full bg-[#00a884] text-white font-semibold py-3 rounded-lg text-sm hover:bg-[#00906f] transition-colors disabled:opacity-30"
            >
              Start Chatting
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111b21] text-white flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-lg font-bold">
            {me?.display_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm">{me?.display_name}</div>
            <div className="text-[0.65rem] text-[#8696a0]">@{me?.username}</div>
          </div>
        </div>
        <button onClick={logout} className="text-xs text-[#8696a0] hover:text-white">
          Logout
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 bg-[#111b21]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-[#202c33] text-white border-none rounded-lg px-4 py-2.5 text-sm outline-none placeholder-[#8696a0]"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a3942]">
        <button
          onClick={() => setTab("chats")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === "chats" ? "text-[#00a884] border-b-2 border-[#00a884]" : "text-[#8696a0]"
          }`}
        >
          Chats
        </button>
        <button
          onClick={() => setTab("contacts")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === "contacts" ? "text-[#00a884] border-b-2 border-[#00a884]" : "text-[#8696a0]"
          }`}
        >
          Contacts
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "chats" && (
          <>
            {conversations.length === 0 ? (
              <div className="text-center py-16 text-[#8696a0] text-sm">
                No chats yet. Go to <button onClick={() => setTab("contacts")} className="text-[#00a884] underline">Contacts</button> to start a conversation.
              </div>
            ) : (
              conversations.map((c) => (
                <a
                  key={c.id}
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#202c33] transition-colors border-b border-[#2a3942]/50 no-underline"
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-[#2a3942] rounded-full flex items-center justify-center text-lg font-bold text-[#8696a0]">
                      {c.other_user?.display_name?.[0]?.toUpperCase()}
                    </div>
                    {c.other_user?.online && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#00a884] rounded-full border-2 border-[#111b21]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <span className="font-semibold text-sm text-white">{c.other_user?.display_name}</span>
                      <span className="text-[0.65rem] text-[#8696a0]">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-0.5">
                      <span className="text-xs text-[#8696a0] truncate">{c.last_message_text || "Start chatting..."}</span>
                      {c.unread > 0 && (
                        <span className="bg-[#00a884] text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))
            )}
          </>
        )}

        {tab === "contacts" && (
          <>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-[#8696a0] text-sm">
                No other users yet. Share the chat link with someone!
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={() => startChat(u)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#202c33] transition-colors cursor-pointer border-b border-[#2a3942]/50"
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-[#2a3942] rounded-full flex items-center justify-center text-lg font-bold text-[#8696a0]">
                      {u.display_name[0]?.toUpperCase()}
                    </div>
                    {u.online && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#00a884] rounded-full border-2 border-[#111b21]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{u.display_name}</div>
                    <div className="text-xs text-[#8696a0]">@{u.username}</div>
                  </div>
                  <span className="text-[#00a884] text-xs">Message</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
