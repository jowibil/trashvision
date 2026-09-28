import { useCallback, useState, type SubmitEvent} from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

// Hoisted so the object literal isn't re-allocated on every render.
const SEND_BUTTON_STYLE = { backgroundColor: "#005D90" };

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [input, setInput] = useState<string>("");

  const handleSubmit = useCallback(
    (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      onSendMessage(input);
      setInput("");
    },
    [input, isLoading, onSendMessage],
  );

  const isDisabled = !input.trim() || isLoading;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-zinc-900/10 bg-[#fcfcfc] p-3"
    >
      <input
        type="text"
        placeholder="Ask TrashVision..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#005D90] focus:bg-white disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isDisabled}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
        style={SEND_BUTTON_STYLE}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}