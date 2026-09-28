import { useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { X } from "lucide-react";
import { useChat } from "../../services/hooks/useChat";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";

// Hoisted so the brand-color object isn't re-created on every render.
const BRAND_BG_STYLE = { backgroundColor: "#005D90" };

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { messages, isLoading, sendMessage } = useChat();

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);
  const closeWidget = useCallback(() => setIsOpen(false), []);

  return (
    <div className="fixed bottom-6 right-6 z-1100 flex flex-col items-end">
      {isOpen ? (
        <div className="mb-4 flex h-[500px] w-[360px] flex-col overflow-hidden rounded-2xl border border-zinc-900/10 bg-[#fcfcfc] shadow-2xl transition-all sm:w-[380px]">
          <div
            className="flex items-center justify-between px-4 py-3.5 text-white"
            style={BRAND_BG_STYLE}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-sm tracking-wide">TrashVision Assistant</span>
            </div>
            <button
              type="button"
              onClick={closeWidget}
              className="rounded-lg p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <ChatWindow messages={messages} isLoading={isLoading} />
          <ChatInput onSendMessage={sendMessage} isLoading={isLoading} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggleOpen}
        className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
        style={BRAND_BG_STYLE}
        aria-label={isOpen ? "Close chatbot" : "Open chatbot"}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
}