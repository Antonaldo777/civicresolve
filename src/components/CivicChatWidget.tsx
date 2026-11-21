import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react';
import {
  CHAT_ROLE_LIST,
  CHAT_ROLE_PRESETS,
  MAX_CHAT_MESSAGE_CHARS,
  buildSanitizedCivicContext,
  resolveChatModel,
} from '../shared/chatDomain.ts';
import {
  AppView,
  CivicChatMessage,
  CivicChatRoleId,
  CivicChatTurn,
} from '../shared/types.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import {
  CivicApiError,
  streamCivicChatMessageApi,
} from '../services/civicApi.ts';
import { useAnnouncer } from '../a11y/LiveAnnouncer.tsx';

interface CivicChatWidgetProps {
  activeView: AppView;
}

function getDefaultRoleForView(view: AppView): CivicChatRoleId {
  if (view === 'admin-triage-and-ops') return 'ops-strategist';
  if (view === 'gemini-ai-insights') return 'field-safety-auditor';
  return 'citizen-concierge';
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-on-surface">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[11px] bg-surface-container px-1 py-0.5 rounded text-secondary"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function FormattedChatText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`${keyPrefix}-ul`} className="list-disc pl-4 space-y-1 my-1">
        {listItems.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineFormatting(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`b-${index}`);
      return;
    }

    const bulletMatch = trimmed.match(/^([*-]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[2]);
      return;
    }

    flushList(`b-${index}`);

    const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        <p
          key={`h-${index}`}
          className="font-display font-bold text-xs text-on-surface pt-1"
        >
          {renderInlineFormatting(headingMatch[1])}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInlineFormatting(trimmed)}
      </p>,
    );
  });

  flushList('end');

  return <div className="space-y-1.5">{blocks}</div>;
}

export function CivicChatWidget({ activeView }: CivicChatWidgetProps) {
  const { stats, selectedIssue, aiConfigured } = useCivicIssues();
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [isOpen, setIsOpen] = useState(false);
  const [rolePreset, setRolePreset] = useState<CivicChatRoleId>(() =>
    getDefaultRoleForView(activeView),
  );
  const [roleManuallyChosen, setRoleManuallyChosen] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [includeLiveContext, setIncludeLiveContext] = useState(true);

  const [messages, setMessages] = useState<CivicChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeRole = CHAT_ROLE_PRESETS[rolePreset];
  const activeModel = resolveChatModel(fastMode);

  // Adapt role preset automatically on navigation until user explicitly selects one
  useEffect(() => {
    if (!roleManuallyChosen && messages.length === 0) {
      setRolePreset(getDefaultRoleForView(activeView));
    }
  }, [activeView, roleManuallyChosen, messages.length]);

  // Auto-scroll scrollable thread whenever messages or streaming content change
  useEffect(() => {
    const el = threadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText, isSending, isOpen]);

  // Focus textarea when opening, Escape closes drawer
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        window.setTimeout(() => launcherRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sanitizedContext = useMemo(() => {
    if (!includeLiveContext) return undefined;
    return buildSanitizedCivicContext(stats, activeView, selectedIssue);
  }, [includeLiveContext, stats, activeView, selectedIssue]);

  const submitPrompt = async (
    rawPrompt: string,
    overrideFastMode?: boolean,
  ) => {
    const trimmed = rawPrompt.trim();
    if (!trimmed || isSending) return;

    const effectiveFastMode =
      overrideFastMode !== undefined ? overrideFastMode : fastMode;

    setErrorMessage(null);
    setLastFailedPrompt(null);

    const historyBeforeTurn: CivicChatTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const userMsg: CivicChatMessage = {
      id: `msg_u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setStreamingText('');
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = '';

    try {
      await streamCivicChatMessageApi(
        {
          message: trimmed,
          history: historyBeforeTurn,
          rolePreset,
          fastMode: effectiveFastMode,
          context: sanitizedContext,
        },
        {
          onChunk: (delta) => {
            accumulated += delta;
            setStreamingText(accumulated);
          },
          onDone: (meta) => {
            const assistantMsg: CivicChatMessage = {
              id: `msg_m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              role: 'model',
              text: meta.reply,
              timestamp: new Date().toISOString(),
              model: meta.model,
              rolePreset: meta.rolePreset,
              tokensUsed: meta.tokensUsed,
              latencyMs: meta.latencyMs,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setStreamingText('');
            announcePolite(
              `Gemini ${activeRole.shortLabel} replied.`,
            );
          },
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        if (accumulated.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_m_${Date.now()}`,
              role: 'model',
              text: `${accumulated.trim()}\n\n[Generation stopped]`,
              timestamp: new Date().toISOString(),
              model: activeModel,
              rolePreset,
            },
          ]);
        }
        setStreamingText('');
        return;
      }

      const msg =
        err instanceof CivicApiError || err instanceof Error
          ? err.message
          : 'Unable to reach Gemini assistant.';
      setStreamingText('');
      setErrorMessage(msg);
      setLastFailedPrompt(trimmed);
      announceAssertive(msg);
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPrompt(inputValue);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitPrompt(inputValue);
    }
  };

  const handleClearThread = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setStreamingText('');
    setErrorMessage(null);
    setLastFailedPrompt(null);
    announcePolite('Cleared CivicResolve Gemini conversation history.');
    inputRef.current?.focus();
  };

  const handleStopStream = () => {
    abortControllerRef.current?.abort();
  };

  const handleRetryFailedTurn = (useFastLite = false) => {
    if (!lastFailedPrompt || isSending) return;
    if (useFastLite) {
      setFastMode(true);
    }
    // Remove the trailing user message that failed so retrying doesn't duplicate it
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    const promptToRetry = lastFailedPrompt;
    setErrorMessage(null);
    setLastFailedPrompt(null);
    window.setTimeout(() => {
      void submitPrompt(promptToRetry, useFastLite ? true : undefined);
    }, 0);
  };

  return (
    <>
      {!isOpen && (
        <button
          ref={launcherRef}
          type="button"
          data-testid="gemini-chat-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open CivicResolve Gemini Assistant"
          aria-expanded={false}
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 inline-flex items-center gap-2.5 rounded-full bg-primary-container text-white pl-3.5 pr-4 py-3 shadow-xl border border-secondary/40 hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-secondary/25 text-secondary-fixed">
            <Bot className="w-4 h-4" aria-hidden="true" />
            <span
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-tertiary-fixed ring-2 ring-primary-container"
              aria-hidden="true"
            />
          </span>
          <span className="flex flex-col text-left leading-tight">
            <span className="font-display text-xs sm:text-sm font-bold tracking-tight">
              Ask Gemini 311
            </span>
            <span className="font-mono text-[10px] text-secondary-fixed/90">
              {messages.length > 0
                ? `${messages.length} ${messages.length === 1 ? 'msg' : 'msgs'} in thread`
                : 'Multi-turn civic bot'}
            </span>
          </span>
        </button>
      )}

      {isOpen && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="CivicResolve Gemini Assistant"
          data-testid="gemini-chat-drawer"
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col w-[calc(100vw-2rem)] sm:w-[420px] h-[min(640px,calc(100dvh-2rem))] rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant/60 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-primary-container text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-secondary/25 border border-secondary-container/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-secondary-fixed" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-display text-sm font-bold leading-tight truncate">
                    CivicResolve Gemini Bot
                  </h2>
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      aiConfigured === false ? 'bg-error-container' : 'bg-tertiary-fixed'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <p className="font-mono text-[10px] text-secondary-fixed/90 truncate">
                  {activeRole.shortLabel} • {activeModel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleClearThread}
                disabled={messages.length === 0 && !isSending && !errorMessage}
                aria-label="Clear conversation history"
                title="Clear conversation history"
                className="p-1.5 rounded-lg text-surface-container-high hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  window.setTimeout(() => launcherRef.current?.focus(), 0);
                }}
                aria-label="Close CivicResolve Gemini Assistant"
                className="p-1.5 rounded-lg text-surface-container-high hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Role Preset & Context Controls */}
          <div className="bg-surface-container-low border-b border-outline-variant/40 px-3.5 py-2.5 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="civic-chat-role"
                  className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1"
                >
                  System Role Preset
                </label>
                <select
                  id="civic-chat-role"
                  value={rolePreset}
                  onChange={(e) => {
                    setRolePreset(e.target.value as CivicChatRoleId);
                    setRoleManuallyChosen(true);
                  }}
                  className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/60 px-2.5 py-1.5 text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/60"
                >
                  {CHAT_ROLE_LIST.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="shrink-0 pt-4">
                <button
                  type="button"
                  aria-pressed={fastMode}
                  onClick={() => setFastMode((prev) => !prev)}
                  title="Toggle Fast Lite model (gemini-3.1-flash-lite) vs General Reasoning (gemini-4-hydrogen)"
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                    fastMode
                      ? 'bg-secondary text-white border-secondary'
                      : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/60 hover:bg-surface-container'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{fastMode ? 'Fast Lite' : 'Hydrogen'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLiveContext}
                  onChange={(e) => setIncludeLiveContext(e.target.checked)}
                  className="rounded border-outline-variant text-secondary focus:ring-secondary"
                />
                <span className="font-medium text-on-surface">
                  Ground with live ledger
                </span>
              </label>
              <span className="font-mono text-[10px] text-secondary truncate">
                {includeLiveContext
                  ? selectedIssue
                    ? `${stats.total} issues • ${selectedIssue.trackingCode}`
                    : `${stats.total} active ledger issues`
                  : 'General civic guidance'}
              </span>
            </div>
          </div>

          {/* Scrollable Conversation Thread */}
          <div
            ref={threadRef}
            data-testid="chat-thread"
            role="log"
            aria-live="polite"
            aria-label="Gemini conversation thread"
            className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3 bg-surface"
          >
            {messages.length === 0 && !streamingText && (
              <div className="space-y-3">
                <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/40 p-3.5 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-secondary">
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      {activeRole.label}
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                      {activeRole.badge}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {activeRole.description}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant px-0.5">
                    Try asking
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {activeRole.starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={isSending}
                        onClick={() => void submitPrompt(prompt)}
                        className="text-left rounded-xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/50 px-3 py-2 text-xs font-medium text-on-surface transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/60"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  data-testid={`chat-message-${msg.role}`}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? 'bg-primary-container text-white rounded-br-sm'
                        : 'bg-surface-container-lowest text-on-surface border border-outline-variant/50 rounded-bl-sm shadow-xs'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-surface-container text-[10px] font-mono text-secondary font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3" aria-hidden="true" />
                          {msg.rolePreset
                            ? CHAT_ROLE_PRESETS[msg.rolePreset].shortLabel
                            : 'Gemini Assistant'}
                        </span>
                        <span className="text-on-surface-variant font-normal">
                          {msg.model ?? activeModel}
                        </span>
                      </div>
                    )}
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    ) : (
                      <FormattedChatText text={msg.text} />
                    )}
                  </div>
                  <span className="mt-1 px-1 font-mono text-[10px] text-on-surface-variant">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {!isUser && msg.latencyMs ? ` • ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                    {!isUser && msg.tokensUsed ? ` • ${msg.tokensUsed} tok` : ''}
                  </span>
                </div>
              );
            })}

            {isSending && (
              <div className="flex flex-col items-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs leading-relaxed bg-surface-container-lowest text-on-surface border border-secondary/40 shadow-xs break-words">
                  <div className="flex items-center gap-1.5 mb-1 font-mono text-[10px] text-secondary font-semibold">
                    <Sparkles className="w-3 h-3 animate-spin" aria-hidden="true" />
                    <span>{activeRole.shortLabel} responding…</span>
                  </div>
                  {streamingText ? (
                    <FormattedChatText text={streamingText} />
                  ) : (
                    <div className="flex items-center gap-1.5 text-on-surface-variant py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-bounce" />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-secondary animate-bounce"
                        style={{ animationDelay: '120ms' }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-secondary animate-bounce"
                        style={{ animationDelay: '240ms' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                data-testid="chat-error-banner"
                className="rounded-xl bg-error-container text-on-error-container border border-error/25 p-3 text-xs space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="leading-relaxed font-medium">{errorMessage}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  {lastFailedPrompt && (
                    <button
                      type="button"
                      onClick={() => handleRetryFailedTurn(false)}
                      className="rounded-md bg-on-error-container text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90"
                    >
                      Retry Turn
                    </button>
                  )}
                  {lastFailedPrompt && !fastMode && (
                    <button
                      type="button"
                      onClick={() => handleRetryFailedTurn(true)}
                      className="rounded-md bg-secondary text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90"
                    >
                      Use Fast Lite &amp; Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="rounded-md border border-on-error-container/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-black/5"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Composer Footer */}
          <form
            onSubmit={handleFormSubmit}
            className="border-t border-outline-variant/40 bg-surface-container-lowest p-3 shrink-0 space-y-2"
          >
            <label htmlFor="civic-chat-input" className="sr-only">
              Message CivicResolve Gemini Assistant
            </label>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                id="civic-chat-input"
                rows={2}
                maxLength={MAX_CHAT_MESSAGE_CHARS}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={`Ask ${activeRole.shortLabel} (Enter to send)...`}
                className="flex-1 resize-none rounded-xl bg-surface-container-low border border-outline-variant/60 px-3 py-2 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/60"
              />
              {isSending ? (
                <button
                  type="button"
                  onClick={handleStopStream}
                  aria-label="Stop Gemini response"
                  className="h-10 w-10 shrink-0 rounded-xl bg-error text-white flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  aria-label="Send message"
                  className="h-10 w-10 shrink-0 rounded-xl bg-secondary text-white flex items-center justify-center hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant px-0.5">
              <span>Shift+Enter for new line • Multi-turn memory active</span>
              <span className="tabular-nums">
                {inputValue.length}/{MAX_CHAT_MESSAGE_CHARS}
              </span>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
