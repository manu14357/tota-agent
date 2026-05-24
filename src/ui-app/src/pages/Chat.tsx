import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowUp, Loader2, User, Copy, Check, ChevronDown, Wrench, ShieldAlert, Paperclip, Mic, Square, WifiOff } from 'lucide-react';
import { api, socket, type ChatMessage, type WSMessage } from '../api';

// Extend ChatMessage to allow step/tool rows and file media locally
type LocalMsg = ChatMessage & {
  isStep?: boolean;
  fileData?: { filePath: string; name: string; mimeType: string; isImage: boolean; size: number };
};

// ── Slash commands ────────────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { name: '/help',        desc: 'Show all available commands and capabilities' },
  { name: '/status',      desc: 'Show agent status: provider, budget, skills' },
  { name: '/memory',      desc: 'View and manage long-term memory' },
  { name: '/permissions', desc: 'Switch between Allow All and Ask Me modes' },
  { name: '/exit',        desc: 'Shutdown the tota agent' },
] as const;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Agent avatar — plain image, no wrapper ────────────────────────────────────
function AgentAvatar({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/tota-agent.png"
      alt="tota"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}

// ── Strip ANSI terminal escape codes ────────────────────────────────────────
function stripAnsi(raw: string): string {
  // Remove ESC[ sequences (e.g. \x1B[1m, \x1B[36m)
  let s = raw.replace(/\x1B\[[\d;]*[mGKHFJA-Za-z]/g, '');
  // Remove bare [ sequences left after ESC was dropped (e.g. [1m [36m)
  s = s.replace(/\[\d+(?:;\d+)*m/g, '');
  return s;
}

// ── Render markdown-lite content ──────────────────────────────────────────
function renderContent(raw: string) {
  const text = stripAnsi(raw);
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (codeMatch) {
      const lang = codeMatch[1] || 'text';
      const code = codeMatch[2];
      return (
        <div key={i} className="msg-code-block">
          {lang && <div className="msg-code-lang">{lang}</div>}
          <pre style={{ margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
        </div>
      );
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i}>
        {boldParts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
            return <strong key={j}>{p.slice(2, -2)}</strong>;
          }
          const inlineParts = p.split(/(`[^`]+`)/g);
          return (
            <span key={j}>
              {inlineParts.map((ip, k) => {
                if (ip.startsWith('`') && ip.endsWith('`') && ip.length > 2) {
                  return <code key={k} className="msg-inline-code">{ip.slice(1, -1)}</code>;
                }
                return ip.split('\n').map((line, l, arr) => (
                  <span key={l}>{line}{l < arr.length - 1 ? <br /> : null}</span>
                ));
              })}
            </span>
          );
        })}
      </span>
    );
  });
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="msg-copy-btn"
      title="Copy"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ── Media bubble — renders image inline or file download chip ─────────────
function MediaBubble({ filePath, name, isImage, size }: {
  filePath: string; name: string; mimeType: string; isImage: boolean; size: number;
}) {
  // Build the URL pointing at the local server's /api/file endpoint
  const url = `/api/file?path=${encodeURIComponent(filePath)}`;
  const sizeStr = size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(size / 1024)} KB`;

  if (isImage) {
    return (
      <div className="media-bubble">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={name} className="media-img" />
        </a>
        <div className="media-caption">{name} · {sizeStr}</div>
      </div>
    );
  }

  return (
    <a href={url} download={name} className="media-file-chip">
      <span className="media-file-icon">📎</span>
      <span className="media-file-name">{name}</span>
      <span className="media-file-size">{sizeStr}</span>
    </a>
  );
}

// ── Tool step chip ────────────────────────────────────────────────────────────
function ToolStepRow({ content }: { content: string }) {
  const label = content.trim().replace(/^\[Using:\s*/, '').replace(/\]$/, '');
  return (
    <div className="tool-step-row">
      <Wrench size={11} className="tool-step-icon" />
      <span className="tool-step-label">{label}</span>
    </div>
  );
}

// ── Permission banner ─────────────────────────────────────────────────────────
function PermissionBanner({ onRespond }: {
  onRespond: (mode: 'allow-all' | 'ask-me') => void;
}) {
  return (
    <div className="permission-banner">
      <ShieldAlert size={16} style={{ color: 'var(--warn)', flexShrink: 0 }} />
      <span className="permission-banner__text">
        tota wants to run a potentially risky action. Choose a permission mode:
      </span>
      <div className="permission-banner__actions">
        <button className="btn--allow-all" onClick={() => onRespond('allow-all')}>
          Allow All
        </button>
        <button className="btn--ask-me" onClick={() => onRespond('ask-me')}>
          Ask Me
        </button>
      </div>
    </div>
  );
}

// ── Slash command palette ─────────────────────────────────────────────────────
function CommandPalette({ filter, activeIdx, onSelect }: {
  filter: string;
  activeIdx: number;
  onSelect: (cmd: string) => void;
}) {
  const filtered = SLASH_COMMANDS.filter(
    (c) => c.name.startsWith('/' + filter) || filter === ''
  );
  if (filtered.length === 0) return null;

  return (
    <div className="cmd-palette">
      <div className="cmd-palette-header">Commands — ↑↓ navigate · Enter select · Esc close</div>
      {filtered.map((c, i) => (
        <button
          key={c.name}
          className={`cmd-item${i === activeIdx ? ' cmd-item--active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(c.name); }}
        >
          <span className="cmd-item__name">{c.name}</span>
          <span className="cmd-item__desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ── Hint chips ────────────────────────────────────────────────────────────────
const HINTS = ['Write some code', 'Search the web', 'List my files', 'Schedule a task'];

// ── Upload a File via POST /api/upload ────────────────────────────────────────
async function uploadFile(file: File): Promise<{ path: string; filename: string; size: number }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages]           = useState<LocalMsg[]>([]);
  const [input, setInput]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [agentStatus, setAgentStatus]     = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [wsConnected, setWsConnected]     = useState(true);

  // Slash command palette state
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdFilter, setCmdFilter]           = useState('');
  const [cmdActiveIdx, setCmdActiveIdx]     = useState(0);

  // Permission request state
  const [permRequest, setPermRequest] = useState<{ requestId: string } | null>(null);

  // File upload state
  const [uploading, setUploading] = useState(false);

  // Audio recording state
  const [recording, setRecording]         = useState(false);
  const mediaRecorderRef                  = useRef<MediaRecorder | null>(null);
  const audioChunksRef                    = useRef<Blob[]>([]);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const threadRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chat history on mount
  useEffect(() => {
    api.get<ChatMessage[]>('/api/memory/short-term')
      .then((h) => {
        if (Array.isArray(h)) {
          // Normalise entries from ShortTermMemory — may lack id/timestamp
          const normalised = h.map((e: any, idx: number) => ({
            id: e.id ?? `hist-${idx}-${Date.now()}`,
            role: e.role === 'assistant' ? 'agent' as const : e.role === 'user' ? 'user' as const : 'agent' as const,
            content: e.content ?? '',
            timestamp: e.timestamp ?? Date.now(),
          }));
          setMessages(normalised);
        }
      })
      .catch(() => {});
  }, []);

  // Safety net: if sending stays true > 90s with no response, unblock it
  useEffect(() => {
    if (!sending) return;
    const t = setTimeout(() => setSending(false), 90_000);
    return () => clearTimeout(t);
  }, [sending]);

  // ── WebSocket messages ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = socket.subscribe((msg: WSMessage) => {
      // Track connection
      setWsConnected(true);

      if (msg.type === 'status') {
        if (msg.status === 'thinking') setAgentStatus('thinking');
        else if (msg.status === 'typing') setAgentStatus('typing');
        else setAgentStatus(null);

      } else if (msg.type === 'file') {
        // Agent sent a file — show it inline in the chat
        const { targetId, filePath, name, mimeType, isImage, size } = msg;
        setAgentStatus(null);
        setSending(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `file-${targetId}-${Date.now()}`,
            role: 'agent' as const,
            content: '',
            timestamp: Date.now(),
            fileData: { filePath, name, mimeType, isImage, size },
          },
        ]);

      } else if (msg.type === 'askPermission') {
        // Backend wants user to choose permission mode
        setPermRequest({ requestId: msg.targetId });

      } else if (msg.type === 'step') {
        // Intermediate tool step
        const { targetId, content } = msg;
        setAgentStatus(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `step-${targetId}-${Date.now()}`,
            role: 'agent' as const,
            content,
            timestamp: Date.now(),
            isStep: true,
          },
        ]);

      } else if (msg.type === 'chunk') {
        // Streaming chunk — build up the agent bubble
        const { targetId: streamId, chunk } = msg;
        setAgentStatus(null);
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === streamId && m.streaming);
          if (existing) {
            return prev.map((m) =>
              m.id === streamId ? { ...m, content: m.content + chunk } : m,
            );
          }
          return [
            ...prev,
            { id: streamId, role: 'agent' as const, content: chunk, timestamp: Date.now(), streaming: true },
          ];
        });

      } else if (msg.type === 'done') {
        // Conversation complete — finalize streaming bubble or add fresh message
        const { requestId: reqId, response } = msg;
        setAgentStatus(null);
        setSending(false);
        setMessages((prev) => {
          const streamingBubble = prev.find((m) => m.id === reqId && m.streaming);
          if (streamingBubble) {
            return prev.map((m) =>
              m.id === reqId && m.streaming ? { ...m, content: response, streaming: false } : m,
            );
          }
          const alreadyFinal = prev.find((m) => m.id === reqId && !m.streaming && !m.isStep);
          if (alreadyFinal) {
            return prev.map((m) =>
              m.id === reqId && !m.streaming && !m.isStep ? { ...m, content: response } : m,
            );
          }
          return [
            ...prev,
            { id: reqId, role: 'agent' as const, content: response, timestamp: Date.now() },
          ];
        });

      } else if (msg.type === 'message') {
        // Non-streaming final message
        const { targetId, content } = msg;
        setAgentStatus(null);
        setSending(false);
        setMessages((prev) => {
          const alreadyFinal = prev.find((m) => m.id === targetId && !m.streaming && !m.isStep);
          if (alreadyFinal) return prev;
          const withoutStream = prev.filter((m) => !(m.id === targetId && m.streaming));
          return [
            ...withoutStream,
            { id: targetId, role: 'agent' as const, content, timestamp: Date.now() },
          ];
        });
      }
    });

    // Track WS disconnection
    const checkConnection = setInterval(() => {
      setWsConnected(socket.isConnected());
    }, 3000);

    return () => { unsub(); clearInterval(checkConnection); };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  const handleScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  // Respond to permission request
  const respondPermission = (mode: 'allow-all' | 'ask-me') => {
    if (!permRequest) return;
    socket.send({ type: 'permissionResponse', requestId: permRequest.requestId, mode });
    setPermRequest(null);
  };

  // Select a slash command
  const selectCommand = (name: string) => {
    setInput(name + ' ');
    setShowCmdPalette(false);
    setCmdFilter('');
    setCmdActiveIdx(0);
    textareaRef.current?.focus();
  };

  // ── File attach — upload to server, then send message with file path ────
  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const result = await uploadFile(file);
      // Send a message to the agent describing the uploaded file
      const mimeType = file.type || 'application/octet-stream';
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
      const content = `[User sent a file]\nFile saved to: ${result.path}\nFilename: ${result.filename}\nType: ${mimeType}\nSize: ${sizeStr}\n\nYou can now read, analyze, or process this file using the appropriate tool (read_pdf, read_excel, read_docx, read_file, analyze_image, etc.), then use send_file to send results back.`;
      await send(content);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'agent', content: `❌ File upload failed: ${err.message}`, timestamp: Date.now() },
      ]);
    } finally {
      setUploading(false);
    }
  };

  // ── Audio recording ─────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 100) return; // too small, ignore
        // Upload the recorded audio
        const file = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setUploading(true);
        try {
          const result = await uploadFile(file);
          const content = `[User sent a voice message]\nFile saved to: ${result.path}\nFilename: ${result.filename}\nType: audio/webm\n\nPlease transcribe this audio using the transcribe_audio tool, then respond to what the user said.`;
          await send(content);
        } catch (err: any) {
          setMessages((prev) => [
            ...prev,
            { id: `err-${Date.now()}`, role: 'agent', content: `❌ Voice upload failed: ${err.message}`, timestamp: Date.now() },
          ]);
        } finally {
          setUploading(false);
        }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'agent', content: '❌ Could not access microphone. Please allow microphone access in your browser.', timestamp: Date.now() },
      ]);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  };

  const filteredCmds = SLASH_COMMANDS.filter(
    (c) => c.name.startsWith('/' + cmdFilter) || cmdFilter === ''
  );

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    setShowCmdPalette(false);
    setCmdFilter('');
    setCmdActiveIdx(0);
    setSending(true);
    setAgentStatus('thinking');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() },
    ]);
    socket.send({ type: 'chat', content });
  }, [input, sending]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    resizeTextarea();

    // Slash command palette logic
    if (val.startsWith('/') && !val.includes(' ')) {
      const filter = val.slice(1); // what they typed after /
      setCmdFilter(filter);
      setCmdActiveIdx(0);
      setShowCmdPalette(true);
    } else {
      setShowCmdPalette(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCmdPalette) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdActiveIdx((i) => Math.min(i + 1, filteredCmds.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCmdPalette(false);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCmds[cmdActiveIdx];
        if (cmd) selectCommand(cmd.name);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="chat-shell">
      {/* WebSocket disconnect banner */}
      {!wsConnected && (
        <div className="ws-disconnect-banner">
          <WifiOff size={14} />
          <span>Connection lost — reconnecting…</span>
        </div>
      )}

      {/* Thread */}
      <div className="chat-thread" ref={threadRef} onScroll={handleScroll}>

        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-mascot">
              <img src="/tota-agent.png" alt="tota" />
            </div>
            <h2 className="chat-welcome-title">Talk to tota</h2>
            <p className="chat-welcome-sub">Your personal AI agent, ready to help.</p>
            <div className="chat-welcome-hints">
              {HINTS.map((h) => (
                <button key={h} className="chat-hint-chip" onClick={() => void send(h)}>{h}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          // ── Tool step chip ─────────────────────────────────────────────────
          if (msg.isStep) {
            return (
              <div key={msg.id} className="tool-step-group">
                <ToolStepRow content={msg.content} />
              </div>
            );
          }

          // ── Normal message bubble ──────────────────────────────────────────
          return (
            <div key={msg.id} className={`msg-group msg-group--${msg.role}`}>
              <div className="msg-row">
                {msg.role !== 'user' && <AgentAvatar size={28} />}

                <div className={`msg-bubble msg-bubble--${msg.role}${msg.streaming ? ' msg-bubble--streaming' : ''}`}>
                  {msg.fileData
                    ? <MediaBubble {...msg.fileData} />
                    : renderContent(msg.content)
                  }
                  {msg.streaming && <span className="cursor-blink" />}
                </div>

                {msg.role !== 'user' && !msg.streaming && !msg.fileData && (
                  <CopyBtn text={msg.content} />
                )}

                {msg.role === 'user' && (
                  <div className="msg-avatar msg-avatar--user">
                    <User size={13} />
                  </div>
                )}
              </div>
              <div className="msg-time">{formatTime(msg.timestamp)}</div>
            </div>
          );
        })}

        {/* Permission request */}
        {permRequest && (
          <div style={{ padding: '0 20px' }}>
            <PermissionBanner onRespond={respondPermission} />
          </div>
        )}

        {/* Thinking/typing indicator */}
        {agentStatus && (
          <div className="msg-group msg-group--agent">
            <div className="msg-row">
              <AgentAvatar size={28} />
              <div className="thinking-bubble">
                <span className="thinking-dots"><span /><span /><span /></span>
                <span className="thinking-label">
                  {agentStatus === 'thinking' ? 'thinking…' : 'typing…'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom} title="Scroll to bottom">
          <ChevronDown size={16} />
        </button>
      )}

      {/* Slash command palette — positioned relative to chat-shell, above compose bar */}
      {showCmdPalette && filteredCmds.length > 0 && (
        <CommandPalette
          filter={cmdFilter}
          activeIdx={cmdActiveIdx}
          onSelect={selectCommand}
        />
      )}

      {/* Compose bar */}
      <div className="compose-bar">
        <div className="compose-inner">
          {/* Left actions */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.zip,.csv,.xlsx,.xls,.json,.py,.js,.ts,.tsx,.jsx,.md,.html,.css,.xml,.yaml,.yml,.sh,.bat,.log,.sql,.r,.go,.rs,.java,.c,.cpp,.h,.rb,.php,.swift,.kt"
            onChange={(e) => void handleFileAttach(e)}
          />
          <button
            className="compose-action-btn"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
          >
            {uploading ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={17} />}
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder='Message tota… (type "/" for commands)'
            className="compose-textarea"
          />

          {/* Right actions — Mic / Stop */}
          <button
            className={`compose-action-btn${recording ? ' compose-action-btn--recording' : ''}`}
            title={recording ? 'Stop recording' : 'Record voice message'}
            onClick={recording ? stopRecording : () => void startRecording()}
            disabled={uploading || sending}
          >
            {recording ? <Square size={15} /> : <Mic size={17} />}
          </button>

          <button
            onClick={() => void send()}
            disabled={!input.trim() || sending}
            className="compose-send"
            title="Send (Enter)"
          >
            {sending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <ArrowUp size={16} />
            }
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
