import { useState, useCallback, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { X } from "lucide-react";
import { useChat } from "../../services/hooks/useChat";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";

// Hoisted so the brand-color object isn't re-created on every render.
const BRAND_BG_STYLE = { backgroundColor: "#005D90" };

// Open/close is a CSS transition (grid-template-rows), not a keyframe mount
// animation — the widget toggles frequently, so state transitions are the
// right tool (animate skill). 200ms ease-out, in the prescription's
// 150–250ms band, with prefers-reduced-motion opting out.
const PANEL_TRANSITION_CSS = `
.chat-panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.chat-panel[data-open="true"] {
  grid-template-rows: 1fr;
  opacity: 1;
}
.chat-panel > div { overflow: hidden; min-height: 0; }
@media (prefers-reduced-motion: reduce) {
  .chat-panel { transition: none; }
}
`;

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { messages, isLoading, sendMessage } = useChat();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  const closeWidget = useCallback(() => {
    setIsOpen(false);
    // Return focus to the trigger so keyboard users don't fall off the page.
    triggerRef.current?.focus();
  }, []);

  // Escape closes the chat, same as the map panels.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWidget();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeWidget]);

  // Nudge the text input to focus on open: bumping the tick re-keys the
  // ChatInput subtree once per open, whose ref callback focuses the input.
  const requestInputFocus = () => {
    setFocusTick((n) => n + 1);
    setIsOpen(true);
  };

  return (
    <div className="fixed bottom-6 right-6 z-1100 flex flex-col items-end">
      <style>{PANEL_TRANSITION_CSS}</style>

      {/* aria-hidden keeps the collapsed panel out of the tab order. */}
      <div className="chat-panel mb-4" data-open={isOpen} aria-hidden={!isOpen}>
        <div>
          <div
            role="dialog"
            aria-label="TrashVision Assistant chat"
            className="flex h-[500px] w-[360px] flex-col overflow-hidden rounded-2xl border border-zinc-900/10 bg-[#fcfcfc] shadow-2xl sm:w-[380px]"
          >
            <div className="flex items-center justify-between px-4 py-3.5 text-white" style={BRAND_BG_STYLE}>
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
                <span className="font-semibold text-sm tracking-wide">TrashVision Assistant</span>
              </div>
              <button
                type="button"
                onClick={closeWidget}
                className="rounded-lg p-1 text-white/80 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 motion-reduce:transition-none"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <ChatWindow messages={messages} isLoading={isLoading} />
            <ChatInput onSendMessage={sendMessage} isLoading={isLoading} focusTick={focusTick} />
          </div>
        </div>
      </div>

      <button
        type="button"
        ref={triggerRef}
        onClick={() => (isOpen ? closeWidget() : requestInputFocus())}
        className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-[box-shadow,transform] duration-200 ease-out hover:shadow-xl active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
        style={BRAND_BG_STYLE}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={isOpen ? "Close chatbot" : "Open chatbot"}
      >
        {isOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageSquare className="h-6 w-6" aria-hidden="true" />}
      </button>
    </div>
  );
}