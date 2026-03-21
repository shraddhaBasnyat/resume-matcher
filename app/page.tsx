"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setStatus("Parsing...");
    setResult(null);

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setStatus("Error: " + (data.message ?? data.error));
      } else {
        setStatus(null);
        setResult(JSON.stringify(data, null, 2));
      }
    } catch {
      setStatus("Failed to reach the server.");
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Resume Parser</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input ref={fileInputRef} type="file" accept="application/pdf" className="block" />
        <button
          type="submit"
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
        >
          Parse Resume
        </button>
      </form>
      {status && <p className="mt-4 text-sm text-red-600">{status}</p>}
      {result && (
        <pre className="mt-6 p-4 bg-gray-100 rounded text-sm overflow-auto">{result}</pre>
      )}
    </main>
  );
}
