import { useState, useCallback, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { X } from "lucide-react";
import { useChat } from "../../services/hooks/useChat";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";


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

  // The wrapper keeps the OPEN panel's width in the layout even when the
  // chat is collapsed (grid-row 0fr + overflow:hidden hides it visually, but
  // its box still spans ~380px) — a fixed bottom-right strip that swallowed
  // clicks on anything beneath it (TrashLogs' pager sat exactly there,
  // making the page arrows feel "stuck"). pointer-events-none on the
  // wrapper + pointer-events-auto on each interactive child restores that
  // area to the page; the widget's own surfaces stay tappable.
  return (
    <div className="fixed bottom-6 right-6 z-1100 flex flex-col items-end pointer-events-none">

      {/* aria-hidden keeps the collapsed panel out of the tab order. */}
      <div className="chat-panel mb-4" data-open={isOpen} aria-hidden={!isOpen}>
        <div>
          {/* Mobile-S guard: the panel otherwise keeps a fixed width and
              overflows narrow viewports (floating panel is right-anchored). */}
          <div
            role="dialog"
            aria-hidden={!isOpen}
            aria-label="TrashVision Assistant chat"
            className="flex h-[500px] w-[min(100vw-4rem,360px)] sm:w-[380px] flex-col overflow-hidden rounded-2xl border border-zinc-900/10 bg-[#fcfcfc] shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 py-3.5 text-white bg-[#005D90]">
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
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#005D90] text-white shadow-lg transition-[box-shadow,transform] duration-200 ease-out hover:shadow-xl active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={isOpen ? "Close chatbot" : "Open chatbot"}
      >
        {isOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageSquare className="h-6 w-6" aria-hidden="true" />}
      </button>
    </div>
  );
}