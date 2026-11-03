import { useCallback, useState, type FormEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  // Bumped once per chat open; the panel re-keys on it, which re-runs the
  // input's ref callback below and puts the cursor back in the box.
  focusTick?: number;
}

// Defined at module scope so it isn't re-created on every render.
const SEND_BUTTON_STYLE = { backgroundColor: "#005D90" };

export default function ChatInput({ onSendMessage, isLoading, focusTick = 0 }: ChatInputProps) {
  const [input, setInput] = useState<string>("");

  const inputRef = useCallback((node: HTMLInputElement | null) => {
    // Fires when the input element mounts — once per chat open, since the
    // widget re-keys on focusTick. Focusing inside a ref callback keeps this
    // dependency-free (no useEffect, no focus-trap libraries).
    if (node) node.focus({ preventScroll: true });
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
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
      key={focusTick}
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-zinc-900/10 bg-[#fcfcfc] p-3"
    >
      <label htmlFor="chat-input" className="sr-only">
        Message TrashVision Assistant
      </label>
      <input
        ref={inputRef}
        id="chat-input"
        type="text"
        placeholder="Ask TrashVision…"
        aria-label="Message TrashVision Assistant"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:border-[#005D90] focus:bg-white focus:ring-2 focus:ring-[#005D90]/20 disabled:opacity-50 motion-reduce:transition-none"
      />
      <button
        type="submit"
        disabled={isDisabled}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-95 disabled:opacity-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 motion-reduce:transition-none"
        style={SEND_BUTTON_STYLE}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}