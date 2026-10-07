// app/page.tsx
"use client";

import { useState } from "react";
import { buildPayload } from "../lib/crisisRouter";

export default function CrisisRouterPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setError("");
    
    try {
      const payload = buildPayload(query);
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const urgencyColors: Record<string, string> = {
    CRITICAL: "#F43F5E",
    HIGH: "#FB923C",
    MEDIUM: "#FBBF24",
    LOW: "#22C55E",
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Crisis Resource Router</h1>
        <p style={styles.subtitle}>Deterministic, offline-first routing for human needs</p>
      </header>

      <form onSubmit={handleSubmit} style={styles.form}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe your situation... e.g., 'I was evicted and have nowhere to go tonight', 'My baby has no formula and I have no money', 'I need a doctor but have no insurance'"
          style={styles.textarea}
          rows={4}
        />
        <button type="submit" disabled={loading || !query.trim()} style={{
          ...styles.button,
          opacity: loading || !query.trim() ? 0.6 : 1,
        }}>
          {loading ? "Routing..." : "Find Resources"}
        </button>
      </form>

      {error && <div style={{ ...styles.error, color: "#F43F5E" }}>{error}</div>}

      {result && (
        <div style={styles.result}>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Primary Categories</h3>
            <div style={styles.tags}>
              {result.primary_categories.map((cat: string) => (
                <span key={cat} style={styles.tag}>{cat}</span>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Urgency Level</h3>
            <span style={{
              ...styles.urgency,
              backgroundColor: urgencyColors[result.urgency_level] || "#64748B",
            }}>
              {result.urgency_level}
            </span>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Search Tokens</h3>
            <div style={styles.tags}>
              {result.search_tokens.map((token: string) => (
                <span key={token} style={styles.tokenTag}>{token}</span>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Actionable Next Steps</h3>
            <ol style={styles.steps}>
              {result.actionable_next_steps.map((step: string, i: number) => (
                <li key={i} style={styles.step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "720px",
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    lineHeight: 1.6,
    color: "#E2E8F0",
    backgroundColor: "#010409",
    minHeight: "100vh",
  },
  header: {
    textAlign: "center",
    marginBottom: "48px",
  },
  title: {
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 900,
    marginBottom: "12px",
    background: "linear-gradient(135deg, #00F0FF, #8B5CF6, #F43F5E)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: "1.1rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    marginBottom: "48px",
  },
  textarea: {
    width: "100%",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid rgba(0, 240, 255, 0.3)",
    backgroundColor: "rgba(10, 16, 28, 0.8)",
    color: "#E2E8F0",
    fontSize: "1rem",
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
    boxShadow: "0 0 30px rgba(0, 240, 255, 0.1)",
  },
  button: {
    padding: "14px 28px",
    borderRadius: "9999px",
    border: "none",
    background: "linear-gradient(135deg, #00F0FF, #8B5CF6)",
    color: "#010409",
    fontWeight: 800,
    fontSize: "1rem",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 0 25px rgba(0, 240, 255, 0.5)",
  },
  error: {
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(244, 63, 94, 0.15)",
    border: "1px solid rgba(244, 63, 94, 0.3)",
    marginBottom: "24px",
  },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  section: {
    backgroundColor: "rgba(10, 16, 28, 0.75)",
    border: "1px solid rgba(0, 240, 255, 0.25)",
    borderRadius: "16px",
    padding: "24px",
  },
  sectionTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#00F0FF",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "16px",
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  tag: {
    padding: "8px 16px",
    borderRadius: "9999px",
    background: "rgba(0, 240, 255, 0.15)",
    border: "1px solid rgba(0, 240, 255, 0.4)",
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  tokenTag: {
    padding: "6px 12px",
    borderRadius: "9999px",
    background: "rgba(139, 92, 246, 0.15)",
    border: "1px solid rgba(139, 92, 246, 0.4)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  urgency: {
    display: "inline-block",
    padding: "10px 24px",
    borderRadius: "9999px",
    fontWeight: 900,
    fontSize: "1.1rem",
    color: "#010409",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    boxShadow: "0 0 20px currentColor",
  },
  steps: {
    margin: 0,
    paddingLeft: "20px",
  },
  step: {
    marginBottom: "10px",
    paddingLeft: "8px",
    borderLeft: "2px solid rgba(0, 240, 255, 0.3)",
  },
};