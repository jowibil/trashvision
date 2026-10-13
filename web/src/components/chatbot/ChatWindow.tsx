import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import ChatMessage from "./ChatMessage";
import type { ChatMessageData } from "../../services/hooks/useChat";

interface ChatWindowProps {
  messages: ChatMessageData[];
  isLoading: boolean;
}

// Hoisted: reused across renders instead of a fresh object each time.
const LOADING_AVATAR_STYLE = { backgroundColor: "#005D90" };

export default function ChatWindow({ messages, isLoading }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#fcfcfc] p-4">
      {messages.map((msg, index) => (
        // Messages are only ever appended, never reordered/removed, so an
        // index key is stable here; there's no natural unique id on
        // ChatMessageData to key by instead.
        <ChatMessage key={index} role={msg.role} text={msg.text} />
      ))}

      {isLoading ? (
        <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-slate-400">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-white"
            style={LOADING_AVATAR_STYLE}
          >
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </div>
          <span role="status">TrashVision AI is thinking…</span>
        </div>
      ) : null}
    </div>
  );
}