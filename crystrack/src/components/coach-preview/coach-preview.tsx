"use client";
import React, { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  coachTool,
  cardTransition,
  type CoachTool,
} from "@/lib/coach-preview/contracts";
import { sseData } from "@/lib/coach-preview/sse";
import type { DataChip } from "@/lib/coach-preview/context";
import type { ProposalCard } from "@/types/coach-preview";
import { coachThemeTokens } from "@/lib/theme";
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: ProposalCard[];
}
const starters = [
  "Help me choose one gentle priority today.",
  "What does my recent spending pace suggest?",
  "How are my goals pacing toward their deadlines?",
];
function describe(tool: CoachTool) {
  if (tool.kind === "create_task")
    return `Create “${tool.title}” on ${tool.weekdays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}.`;
  if (tool.kind === "log_expense")
    return `Record ₦${tool.amount} for ${tool.note} in your staging ledger.`;
  if (tool.kind === "reallocate_budget")
    return `Move ₦${tool.amount} from budget ${tool.from} to ${tool.to}.`;
  return `Set goal ${tool.goalId} target to ${tool.targetValue} (revision ${tool.expectedRevision}).`;
}
export function CoachPreview() {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Your preview coach is ready."),
    [chips, setChips] = useState<DataChip[]>([]),
    [zone, setZone] = useState(""),
    [confirmation, setConfirmation] = useState<ProposalCard | null>(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    end = useRef<HTMLDivElement>(null),
    locks = useRef(new Set<string>());
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    let ignore = false;
    let sequence = 0;
    const inspect = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "confirm",
      );
      if (!token) return;
      const current = ++sequence;
      window.history.replaceState(null, "", window.location.pathname);
      void fetch("/api/preview/coach/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error ||
                "Sign in to your preview workspace to review this expense.",
            );
          const tool = coachTool.parse(body.tool);
          if (!ignore && current === sequence)
            setConfirmation({ token, tool, state: "pending" });
        })
        .catch((error) => {
          if (!ignore && current === sequence) setStatus(error.message);
        });
    };
    inspect();
    window.addEventListener("hashchange", inspect);
    return () => {
      ignore = true;
      window.removeEventListener("hashchange", inspect);
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [messages]);
  function updateCard(
    token: string,
    update: (card: ProposalCard) => ProposalCard,
  ) {
    setMessages((rows) =>
      rows.map((row) => ({
        ...row,
        cards: row.cards.map((card) =>
          card.token === token ? update(card) : card,
        ),
      })),
    );
    setConfirmation((card) => (card?.token === token ? update(card) : card));
  }
  async function decide(card: ProposalCard, decision: "approve" | "dismiss") {
    if (card.state !== "pending" || locks.current.has(card.token)) return;
    locks.current.add(card.token);
    updateCard(card.token, (c) => ({
      ...c,
      state: cardTransition(c.state, decision),
    }));
    try {
      const response = await fetch("/api/preview/coach/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: card.token, decision }),
          cache: "no-store",
        }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Please refresh your preview data.");
      if (!["approved", "dismissed"].includes(body.status))
        throw new Error("The confirmation could not be verified.");
      updateCard(card.token, (c) => ({ ...c, state: body.status }));
      setStatus(
        body.status === "approved"
          ? "Saved in your staging workspace."
          : "Proposal dismissed. Your data is unchanged.",
      );
    } catch (error) {
      updateCard(card.token, (c) => ({
        ...c,
        state: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Please try a fresh proposal.",
      }));
    } finally {
      locks.current.delete(card.token);
    }
  }
  async function send(text = input) {
    if (busy || !text.trim()) return;
    const prompt = text.trim().slice(0, 4000),
      id = crypto.randomUUID(),
      run = ++generation.current,
      abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setInput("");
    setStatus("Your coach is considering your real statistics…");
    const history = [
      ...messages
        .filter((m) => m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
      { role: "user" as const, content: prompt },
    ];
    setMessages((rows) => [
      ...rows,
      { id: crypto.randomUUID(), role: "user", content: prompt, cards: [] },
      { id, role: "assistant", content: "", cards: [] },
    ]);
    try {
      const response = await fetch("/api/preview/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: abort.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.error || "The preview coach is resting. Try again shortly.",
        );
      }
      if (!response.body)
        throw new Error("The response stream could not open.");
      let done = false;
      for await (const raw of sseData(response.body, abort.signal)) {
        if (run !== generation.current) break;
        const event = JSON.parse(raw);
        if (event.type === "text" && typeof event.text === "string")
          setMessages((rows) =>
            rows.map((row) =>
              row.id === id
                ? { ...row, content: row.content + event.text }
                : row,
            ),
          );
        else if (event.type === "proposal") {
          const tool = coachTool.parse(event.tool);
          if (typeof event.token !== "string")
            throw new Error("Invalid proposal");
          setMessages((rows) =>
            rows.map((row) =>
              row.id === id
                ? {
                    ...row,
                    cards: [
                      ...row.cards,
                      { tool, token: event.token, state: "pending" },
                    ],
                  }
                : row,
            ),
          );
        } else if (event.type === "context" && Array.isArray(event.chips)) {
          setChips(event.chips);
          setZone(String(event.timezone));
        } else if (event.type === "error") throw new Error(event.message);
        else if (event.type === "done") {
          done = true;
          setStatus("Ready when you are. Changes wait for your approval.");
        }
      }
      if (!done && !abort.signal.aborted && run === generation.current)
        throw new Error("The response paused. You can try again.");
    } catch (error) {
      if (run === generation.current)
        setStatus(
          abort.signal.aborted
            ? "Stopped. No changes were made."
            : error instanceof Error
              ? error.message
              : "Your coach paused. Ready to try again?",
        );
    } finally {
      if (run === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  function reset() {
    if (
      !window.confirm(
        "Clear this preview conversation? Your saved staging data stays as it is.",
      )
    )
      return;
    generation.current++;
    controller.current?.abort();
    setMessages([]);
    setChips([]);
    setBusy(false);
    setStatus("A fresh start. What would help today?");
  }
  async function connect() {
    try {
      const response = await fetch("/api/preview/telegram/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Preview Telegram is not ready.");
      window.location.assign(body.url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Please try again.");
    }
  }
  function cardView(card: ProposalCard) {
    return (
      <GlassCard key={card.token} hover className="coach-action">
        <p className="coach-eyebrow">Proposed change · staging only</p>
        <p>{describe(card.tool)}</p>
        <p className="coach-secondary">
          Approval applies this exact proposal once. Links expire after 15
          minutes.
        </p>
        {card.state === "pending" ? (
          <div className="coach-controls">
            <button
              className="goal-button"
              onClick={() => void decide(card, "approve")}
            >
              Approve
            </button>
            <button
              className="goal-button"
              onClick={() => void decide(card, "dismiss")}
            >
              Dismiss
            </button>
          </div>
        ) : (
          <p role="status">
            {card.state === "applying"
              ? "Saving in staging…"
              : card.state === "approved"
                ? "Approved · saved in staging"
                : card.state === "dismissed"
                  ? "Dismissed"
                  : "Please request a fresh proposal."}
          </p>
        )}
        {card.error && <p role="alert">{card.error}</p>}
      </GlassCard>
    );
  }
  return (
    <section
      className="coach-preview"
      style={coachThemeTokens as React.CSSProperties}
    >
      <header className="coach-heading">
        <div>
          <p className="coach-eyebrow">Private preview · staging data only</p>
          <h1>Your thoughtful AI coach</h1>
          <p>Make space for a useful next step. You choose what changes.</p>
        </div>
        <div className="coach-controls">
          <button className="goal-button" onClick={() => void connect()}>
            Connect staging Telegram
          </button>
          <button
            className="goal-button"
            disabled={locks.current.size > 0}
            onClick={reset}
          >
            Reset conversation
          </button>
        </div>
      </header>
      {confirmation && (
        <section aria-label="Telegram expense confirmation">
          {cardView(confirmation)}
        </section>
      )}
      <div className="coach-layout">
        <GlassCard className="coach-chat" hover>
          <div className="coach-starters">
            {starters.map((prompt) => (
              <button
                key={prompt}
                className="goal-button"
                disabled={busy}
                onClick={() => void send(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div
            className="coach-messages"
            role="log"
            aria-label="Preview coaching conversation"
            aria-busy={busy}
          >
            {messages.length === 0 && (
              <p className="coach-empty">
                Bring a question about your day, your goals, or your spending.
                Your coach will ground its suggestions in your own data.
              </p>
            )}
            {messages.map((row) => (
              <article
                key={row.id}
                className={"coach-message coach-message--" + row.role}
              >
                <p className="coach-eyebrow">
                  {row.role === "user" ? "You" : "CrysTrack coach"}
                </p>
                <p className="coach-copy">
                  {row.content || "Considering your question…"}
                </p>
                {row.cards.map(cardView)}
              </article>
            ))}
            <div ref={end} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="coach-message">What would help you today?</label>
            <textarea
              id="coach-message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Let’s find one manageable next step…"
            />
            <div className="coach-controls">
              <button
                className="goal-button"
                type="submit"
                disabled={busy || !input.trim()}
              >
                Send
              </button>
              {busy && (
                <button
                  className="goal-button"
                  type="button"
                  onClick={() => controller.current?.abort()}
                >
                  Stop response
                </button>
              )}
            </div>
          </form>
          <p role="status" className="coach-secondary">
            {status}
          </p>
        </GlassCard>
        <aside>
          <GlassCard hover>
            <h2>Your evidence</h2>
            <p className="coach-secondary">
              Verified statistics from your staging account
              {zone ? " · " + zone : ""}. Refreshed with each message.
            </p>
            {chips.length === 0 ? (
              <p>Send a prompt to load your current statistics.</p>
            ) : (
              <dl className="coach-chips">
                {chips.map((chip) => (
                  <div key={chip.id}>
                    <dt>{chip.label}</dt>
                    <dd>{chip.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="coach-secondary">
              AI can make mistakes. Review every proposed change. Chat text is
              kept in this tab only.
            </p>
          </GlassCard>
        </aside>
      </div>
    </section>
  );
}
