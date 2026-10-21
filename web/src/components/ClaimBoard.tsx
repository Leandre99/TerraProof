"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";

const COLS = 18;
const ROWS = 8;

// Two pre-registered parcels, irregular like real land.
const parcelAt = (r: number, c: number): 1 | 2 | 0 => {
  const inA = c >= 1 && c <= 6 && r >= 2 && r <= 6 && !(r === 2 && c === 1) && !(r === 6 && c === 6) && !(r === 6 && c === 1);
  if (inA) return 1;
  const inB = c >= 11 && c <= 15 && r >= 1 && r <= 4 && !(r === 1 && c === 11) && !(r === 4 && c === 15);
  if (inB) return 2;
  return 0;
};

const cellId = (r: number, c: number) => "0x" + (0xc0473a6800 + r * 64 + c).toString(16);

type Entry = { id: number; kind: "claim" | "reject"; text: string };

/**
 * The product's core idea as a toy: claim land cells, then try to claim a cell somebody else already owns.
 */
export function ClaimBoard() {
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [shake, setShake] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(0);
  const [tape, setTape] = useState<Entry[]>([]);
  const [msg, setMsg] = useState<{ tone: "idle" | "ok" | "bad"; text: string }>({
    tone: "idle",
    text: "Click empty cells to claim land. Then try a coloured one.",
  });
  const seq = useRef(0);

  const push = useCallback((e: Omit<Entry, "id">) => setTape((t) => [{ ...e, id: ++seq.current }, ...t].slice(0, 5)), []);

  const click = (r: number, c: number) => {
    const key = `${r}-${c}`;
    const owner = parcelAt(r, c);
    if (owner) {
      setBlocked((b) => b + 1);
      setShake(key);
      setTimeout(() => setShake((s) => (s === key ? null : s)), 450);
      const text = `Cell ${cellId(r, c)} already belongs to parcel #${owner}`;
      setMsg({ tone: "bad", text: `Rejected. ${text}. The contract reverts the transaction.` });
      push({ kind: "reject", text: `REVERT · ${text}` });
      return;
    }
    if (mine.has(key)) {
      const next = new Set(mine);
      next.delete(key);
      setMine(next);
      setMsg({ tone: "idle", text: "Claim released. Claim it again, or try someone else's land." });
      return;
    }
    const next = new Set(mine).add(key);
    setMine(next);
    setMsg({ tone: "ok", text: `Claimed ${cellId(r, c)}. You now own ${next.size} cell${next.size > 1 ? "s" : ""}. Nobody else can.` });
    push({ kind: "claim", text: `CLAIM · ${cellId(r, c)} → you` });
  };

  const reset = () => {
    setMine(new Set());
    setBlocked(0);
    setTape([]);
    setMsg({ tone: "idle", text: "Click empty cells to claim land. Then try a coloured one." });
  };

  const cells = useMemo(() => Array.from({ length: ROWS * COLS }, (_, i) => [Math.floor(i / COLS), i % COLS] as const), []);

  return (
    <div className="card-hard bg-topo-soft overflow-hidden">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-ink px-4 py-2.5">
        <p className="label">Claim board · geohash/8 · 7.9335°N 2.0595°E</p>
        <div className="flex items-center gap-4">
          <p className="label">
            Double claims blocked: <span className={`font-medium ${blocked ? "text-danger" : "text-ink"}`}>{blocked}</span>
          </p>
          <button onClick={reset} className="label flex items-center gap-1 hover:text-ink" aria-label="Reset the board">
            <RotateCcw className="h-3 w-3" /> reset
          </button>
        </div>
      </div>

      <div className="relative z-10 grid gap-0 lg:grid-cols-[1fr_250px]">
        <div className="p-3 sm:p-5">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} role="grid" aria-label="Land cells">
            {cells.map(([r, c]) => {
              const key = `${r}-${c}`;
              const owner = parcelAt(r, c);
              const isMine = mine.has(key);
              const shaking = shake === key;
              const first = (owner === 1 && r === 2 && c === 2) || (owner === 2 && r === 1 && c === 12);
              let cls = "border-ink/15 bg-surface/60 hover:bg-lime/70 hover:border-ink";
              if (owner === 1) cls = "border-ink bg-brand text-bg";
              if (owner === 2) cls = "border-ink bg-sky text-bg";
              if (isMine) cls = "border-ink bg-lime text-ink";
              if (shaking) cls = "border-danger bg-danger text-bg animate-shake";
              return (
                <button
                  key={key}
                  onClick={() => click(r, c)}
                  title={`${cellId(r, c)}${owner ? ` · parcel #${owner}` : isMine ? " · yours" : " · free"}`}
                  aria-label={`Cell ${cellId(r, c)}: ${owner ? `claimed by parcel ${owner}` : isMine ? "claimed by you" : "free"}`}
                  className={`relative flex aspect-[2/1] items-center justify-center rounded-[3px] border text-[10px] font-medium transition-colors duration-100 ${cls}`}
                >
                  {first && <span className="font-mono">#{owner}</span>}
                  {isMine && <Check className="h-3 w-3" strokeWidth={3} />}
                  {shaking && <X className="h-3.5 w-3.5" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          </div>

          <p
            aria-live="polite"
            className={`mt-4 min-h-[44px] rounded-[4px] border px-3 py-2 text-sm leading-snug ${
              msg.tone === "bad"
                ? "border-danger bg-danger/10 font-medium text-danger"
                : msg.tone === "ok"
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-dashed border-ink/25 text-mute"
            }`}
          >
            {msg.text}
          </p>
        </div>

        {/* Receipt tape */}
        <aside className="border-t-[1.5px] border-ink bg-raised/70 p-4 lg:border-l-[1.5px] lg:border-t-0" aria-label="Ledger tape">
          <p className="label mb-3">Ledger tape</p>
          {tape.length === 0 ? (
            <p className="font-mono text-[11px] leading-relaxed text-mute/80">— no activity —</p>
          ) : (
            <ul className="space-y-2 font-mono text-[11px] leading-snug">
              {tape.map((t) => (
                <li key={t.id} className={`animate-rise border-b border-dashed border-ink/20 pb-2 ${t.kind === "reject" ? "text-danger" : "text-ink"}`}>
                  {t.text}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <span className="label flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[2px] border border-ink bg-brand" /> #1
            </span>
            <span className="label flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[2px] border border-ink bg-sky" /> #2
            </span>
            <span className="label flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[2px] border border-ink bg-lime" /> you
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
