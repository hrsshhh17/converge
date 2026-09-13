"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMOJI_OPTIONS } from "./emoji-options";
import "./global-emoji-picker.css";

type EmojiField = HTMLInputElement | HTMLTextAreaElement;

const supportsEmoji = (element: Element): element is EmojiField => {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (!(element instanceof HTMLInputElement) || (element.type && element.type !== "text") || element.readOnly || element.disabled) return false;
  const intent = `${element.getAttribute("aria-label") || ""} ${element.placeholder || ""} ${element.name || ""}`;
  return !/(search|find|filter|url|link|email|phone|date|time|code|token)/i.test(intent);
};

export default function GlobalEmojiPicker() {
  const [field, setField] = useState<EmojiField | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const fieldRef = useRef<EmojiField | null>(null);

  useEffect(() => {
    const place = () => {
      const target = fieldRef.current;
      if (!target || !document.contains(target)) return;
      const rect = target.getBoundingClientRect();
      setPosition({ top: Math.max(8, rect.bottom - 38), left: Math.max(8, Math.min(window.innerWidth - 42, rect.right - 38)) });
    };
    const focused = (event: FocusEvent) => {
      const target = event.target as Element;
      if (target.closest(".globalEmojiWidget")) return;
      if (!supportsEmoji(target) || target.matches("[data-no-emoji]") || target.closest(".chatComposer,.commentDialog,.workspaceSearch,.inboxSearch,.contactSearch,.groupSearch,.libraryChats,.toolFilters")) {
        fieldRef.current = null;
        setField(null);
        setOpen(false);
        return;
      }
      fieldRef.current = target;
      setField(target);
      setOpen(false);
      requestAnimationFrame(place);
    };
    document.addEventListener("focusin", focused);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      document.removeEventListener("focusin", focused);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, []);

  const insert = (emoji: string) => {
    const target = fieldRef.current;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const next = `${target.value.slice(0, start)}${emoji}${target.value.slice(end)}`;
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, next);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    requestAnimationFrame(() => target.setSelectionRange(start + emoji.length, start + emoji.length));
  };

  if (!field || typeof document === "undefined") return null;
  return createPortal(
    <aside className="globalEmojiWidget" style={{ top: position.top, left: position.left }}>
      <button type="button" className="globalEmojiTrigger" aria-label="Add emoji" aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>☺</button>
      {open && <div className="globalEmojiPalette" role="dialog" aria-label="Choose an emoji">{EMOJI_OPTIONS.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(emoji)}>{emoji}</button>)}</div>}
    </aside>,
    document.body,
  );
}
