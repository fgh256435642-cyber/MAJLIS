import React, { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-1.5 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#1E1F22] max-w-2xl">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-white/10">
        <span className="font-mono">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono text-slate-800 dark:text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(
  text: string,
  currentUsername?: string,
  keyPrefix = 'in',
  onExternalLinkClick?: (url: string) => void
): React.ReactNode[] {
  // Match inline code, bold, italic, strikethrough, @mentions, or https:// URLs
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|@[a-zA-Z0-9_.-]{2,32}|https:\/\/[^\s<>()]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-200/80 dark:bg-[#1E1F22] font-mono text-[0.85em] text-slate-900 dark:text-zinc-100"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-slate-950 dark:text-white">
          {renderInline(token.slice(2, -2), currentUsername, `${key}-b`, onExternalLinkClick)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={key} className="italic">
          {renderInline(token.slice(1, -1), currentUsername, `${key}-i`, onExternalLinkClick)}
        </em>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(
        <del key={key} className="line-through opacity-75">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('@')) {
      const handle = token.slice(1).toLowerCase();
      const isSelf =
        currentUsername?.toLowerCase() === handle ||
        handle === 'everyone' ||
        handle === 'here';
      parts.push(
        <span
          key={key}
          className={`px-1 py-0.5 rounded font-medium ${
            isSelf
              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
              : 'bg-nexus/15 text-nexus'
          }`}
        >
          {token}
        </span>
      );
    } else if (token.startsWith('https://')) {
      parts.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (onExternalLinkClick) {
              e.preventDefault();
              onExternalLinkClick(token);
            }
          }}
          className="text-[#006CE7] dark:text-[#00A8FC] hover:underline break-all"
        >
          {token}
        </a>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function RichMessageContent({
  content,
  currentUsername,
  onExternalLinkClick,
}: {
  content: string;
  currentUsername?: string;
  onExternalLinkClick?: (url: string) => void;
}) {
  if (!content) return null;

  // Split by fenced code blocks ```lang\n...\n```
  const blockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textSegment = content.slice(lastIndex, match.index);
      nodes.push(
        renderTextLines(textSegment, currentUsername, `seg-${blockIdx++}`, onExternalLinkClick)
      );
    }
    nodes.push(
      <CodeBlock
        key={`cb-${blockIdx++}`}
        language={match[1] || ''}
        code={match[2].replace(/\n$/, '')}
      />
    );
    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    nodes.push(
      renderTextLines(
        content.slice(lastIndex),
        currentUsername,
        `seg-${blockIdx++}`,
        onExternalLinkClick
      )
    );
  }

  return <div className="space-y-0.5 break-words">{nodes}</div>;
}

function renderTextLines(
  segment: string,
  currentUsername: string | undefined,
  keyPrefix: string,
  onExternalLinkClick?: (url: string) => void
) {
  const lines = segment.split('\n');
  return (
    <React.Fragment key={keyPrefix}>
      {lines.map((line, i) => {
        if (line.startsWith('> ')) {
          return (
            <div
              key={`${keyPrefix}-l-${i}`}
              className="pl-2.5 my-0.5 text-slate-600 dark:text-zinc-300 bg-slate-100/70 dark:bg-white/5 rounded py-0.5 pr-2"
            >
              {renderInline(
                line.slice(2),
                currentUsername,
                `${keyPrefix}-q-${i}`,
                onExternalLinkClick
              )}
            </div>
          );
        }
        return (
          <div key={`${keyPrefix}-l-${i}`} className="min-h-[1.25rem]">
            {line
              ? renderInline(
                  line,
                  currentUsername,
                  `${keyPrefix}-r-${i}`,
                  onExternalLinkClick
                )
              : '\u00A0'}
          </div>
        );
      })}
    </React.Fragment>
  );
}

export function LinkEmbedCard({
  url,
  onExternalLinkClick,
}: {
  url: string;
  onExternalLinkClick?: (url: string) => void;
}) {
  let hostname = url;
  let pathPreview = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, '');
    pathPreview = parsed.pathname === '/' ? '' : parsed.pathname;
  } catch {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (onExternalLinkClick) {
          e.preventDefault();
          onExternalLinkClick(url);
        }
      }}
      className="mt-1.5 flex items-center justify-between gap-3 max-w-md rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-[#32353B] transition-colors group"
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
          {hostname}
        </div>
        <div className="text-sm font-medium text-[#006CE7] dark:text-[#00A8FC] truncate group-hover:underline">
          {hostname}
          {pathPreview}
        </div>
      </div>
      <ExternalLink className="w-4 h-4 shrink-0 text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-200" />
    </a>
  );
}
