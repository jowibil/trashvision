import { Bot } from "lucide-react";
import { User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatMessageData } from "../../services/hooks/useChat";

// Hoisted: same object reused for every bot-avatar render instead of a
// fresh literal per message.
const AVATAR_STYLE = { backgroundColor: "#005D90" };

const MARKDOWN_COMPONENTS = {
  p: ({ node: _node, ...props }: any) => <p className="whitespace-pre-wrap" {...props} />,
  strong: ({ node: _node, ...props }: any) => <strong className="font-semibold" {...props} />,
  ul: ({ node: _node, ...props }: any) => <ul className="list-disc pl-4" {...props} />,
  ol: ({ node: _node, ...props }: any) => <ol className="list-decimal pl-4" {...props} />,
};

export default function ChatMessage({ role, text }: ChatMessageData) {
  const isBot = role === "bot";

  return (
    <div className={`flex w-full gap-3 ${isBot ? "justify-start" : "justify-end"} mb-4`}>
      {isBot ? (
        <div
          className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-white shadow-sm"
          style={AVATAR_STYLE}
        >
          <Bot className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}

      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isBot
            ? "rounded-tl-sm bg-slate-100 text-slate-800 border border-zinc-900/5 text-left"
            : "rounded-tr-sm bg-[#005D90] text-white text-left"
        }`}
      >
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
      </div>

      {!isBot ? (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-slate-200 text-slate-600">
          <User className="h-4 w-4" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}