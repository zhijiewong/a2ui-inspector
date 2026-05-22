import { useEffect, useState } from "react";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { encodeSession, MAX_FRAGMENT_BYTES } from "../share/codec.js";

const SHARE_BASE_URL =
  (import.meta.env.VITE_SHARE_BASE_URL as string | undefined) ??
  location.origin + location.pathname;

type DialogState =
  | { kind: "encoding" }
  | { kind: "empty" }
  | { kind: "too-large"; bytes: number }
  | { kind: "ready"; link: string }
  | { kind: "error"; message: string };

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  entries: SessionEntry[];
}

export function ShareDialog({ open, onClose, entries }: ShareDialogProps) {
  const [state, setState] = useState<DialogState>({ kind: "encoding" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    if (entries.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "encoding" });
    let cancelled = false;
    encodeSession(entries)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ kind: "ready", link: `${SHARE_BASE_URL}#share=${res.fragment}` });
        else setState({ kind: "too-large", bytes: res.bytes });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String((err as Error).message) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, entries]);

  if (!open) return null;

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setState({ kind: "error", message: "Copy failed — select the link manually." });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={onClose}
    >
      <div
        className="w-[34rem] max-w-[90vw] rounded border border-edge-strong bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-semibold text-ink">Share session</div>

        {state.kind === "encoding" && <p className="text-sm text-ink-muted">Encoding…</p>}

        {state.kind === "empty" && (
          <p className="text-sm text-ink-muted">
            Nothing to share — load or record a session first.
          </p>
        )}

        {state.kind === "too-large" && (
          <p className="text-sm text-ink-muted">
            This session is too large to share as a link ({Math.ceil(state.bytes / 1024)} KB &gt;{" "}
            {MAX_FRAGMENT_BYTES / 1024} KB limit). Use <span className="text-ink">Save</span> to
            export the .jsonl file and share that instead.
          </p>
        )}

        {state.kind === "error" && <p className="text-sm text-red-300">{state.message}</p>}

        {state.kind === "ready" && (
          <>
            <p className="mb-2 text-sm text-amber-300">
              This link contains the full session data, including anything sensitive in it. Anyone
              with the link can read it.
            </p>
            <input
              readOnly
              aria-label="Share link"
              value={state.link}
              className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => copy(state.link)}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
