'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AIChatMessage } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { Send, Bot, User, Radio, ChevronRight, Loader2 } from 'lucide-react';

const SUGGESTED_QUESTIONS = [
  'Why is ORBIT-01 at high risk?',
  'What changed in the last 30 minutes?',
  'Which spacecraft should the team investigate first?',
  'Explain the current anomaly in simple terms.',
  'Which subsystem is causing the most health reduction?',
  'What is the status of all spacecraft?',
];

const LIVE_TELEMETRY_QUESTIONS = [
  'Analyze live orbit trajectory & eclipse window',
  'Report current solar array efficiency from live telemetry',
  'Check live spacecraft thermal balance',
  'Verify downlink signal and ground station contact',
];

const SYSTEM_WELCOME = `OrbitGuard AI Mission Copilot is online.

I have access to real-time spacecraft telemetry, detected anomalies, and mission data. I can help you:
• Analyze spacecraft health and anomalies
• Explain telemetry trends in plain language
• Prioritize investigation targets
• Recommend corrective actions

Ask me anything about the current mission status.`;

export default function MissionCopilotPage() {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: SYSTEM_WELCOME,
      timestamp: new Date().toISOString(),
      metadata: { data_source: 'demo' },
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null); // null = loading
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Eagerly resolve AI provider on mount via /api/ai/health (no credentials exposed)
  const resolveProvider = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/health');
      if (res.ok) {
        const data = await res.json();
        setAiProvider(data.active_provider ?? data.provider ?? 'demo');
      }
    } catch {
      setAiProvider('demo');
    }
  }, []);

  useEffect(() => {
    resolveProvider();
  }, [resolveProvider]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question?: string) => {
    const q = question || input.trim();
    if (!q || loading) return;

    setInput('');
    const userMsg: AIChatMessage = {
      id: generateId(),
      role: 'user',
      content: q,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          conversation_history: messages.slice(-6), // Last 6 messages for context
        }),
      });

      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();

      // Update provider indicator from response (lazy resolution)
      if (data.provider) setAiProvider(data.provider);
      const assistantMsg: AIChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response || 'Unable to generate response.',
        timestamp: new Date().toISOString(),
        metadata: {
          confidence: data.confidence,
          data_source: data.provider,
        },
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

   const formatMessage = (rawContent: unknown): string => {
  let content: string;
  if (typeof rawContent === "string") {
    content = rawContent;
  } else if (rawContent && typeof rawContent === "object") {
    const obj = rawContent as Record<string, unknown>;
    content = typeof obj.text === "string" ? obj.text : JSON.stringify(rawContent, null, 2);
  } else {
    content = String(rawContent ?? "");
  }

  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(
      /^• (.*$)/gm,
      '<span class="flex gap-2 my-0.5"><span class="text-blue-400 flex-shrink-0">▸</span><span>$1</span></span>'
    )
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
};


  return (
    <AppShell
      title="Mission Copilot"
      subtitle="AI-powered mission decision support"
      dataSource="mixed"
    >
      <div className="flex gap-5 h-[calc(100vh-7rem)]">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-blue-400" />
                  </div>
                )}

                <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  <div
                    className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600/20 border border-blue-500/30 text-slate-200 ml-auto'
                        : 'bg-[#0f1a2e] border border-[#1e2d4a] text-slate-300'
                    }`}
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />
                  <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] text-slate-600">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    {msg.metadata?.confidence && (
                      <span className="text-[10px] text-slate-600">
                        · {(msg.metadata.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                    {msg.metadata?.data_source && (
                      <span className="text-[10px] text-slate-600">
                        · {msg.metadata.data_source}
                      </span>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-[#0f1a2e] border border-[#1e2d4a] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-slate-400">Analyzing mission data...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-3 flex-shrink-0">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about spacecraft status, anomalies, telemetry..."
                rows={2}
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none leading-relaxed"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#1e2d4a]">
              <Radio className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] text-slate-500">
                {aiProvider === null
                  ? 'Connecting to AI engine…'
                  : aiProvider === 'watsonx'
                  ? 'IBM Granite · watsonx.ai'
                  : 'Demo AI — Configure watsonx credentials for IBM Granite'}
              </span>
            </div>
          </div>
        </div>

        {/* Suggested questions sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4">
          <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-300 mb-3">Suggested Questions</div>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="w-full text-left text-xs text-slate-400 hover:text-slate-200 bg-[#080d1a] border border-[#1e2d4a] hover:border-[#2a3d5e] rounded-lg px-3 py-2.5 transition-colors flex items-start gap-2 group disabled:opacity-50"
                >
                  <ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Live telemetry questions */}
          <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <div className="text-xs font-semibold text-slate-300">Live Telemetry Analysis</div>
            </div>
            <div className="space-y-2">
              {LIVE_TELEMETRY_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="w-full text-left text-xs text-slate-400 hover:text-slate-200 bg-[#080d1a] border border-emerald-900/40 hover:border-emerald-700/50 rounded-lg px-3 py-2.5 transition-colors flex items-start gap-2 group disabled:opacity-50"
                >
                  <ChevronRight className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* AI status card */}
          <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-300 mb-3">AI Engine Status</div>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Provider</span>
                {aiProvider === null ? (
                  <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                ) : (
                  <span className={aiProvider === 'watsonx' ? 'text-emerald-400' : 'text-amber-400'}>
                    {aiProvider === 'watsonx' ? 'IBM Granite' : 'Demo Mode'}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                {aiProvider === null ? (
                  <span className="text-slate-600">Checking…</span>
                ) : (
                  <span className={aiProvider === 'watsonx' ? 'text-emerald-400' : 'text-amber-400'}>
                    {aiProvider === 'watsonx' ? 'Connected' : 'Demo Mode'}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Orbital Data</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  ISS NORAD 25544
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data Access</span>
                <span className="text-blue-400">Live Telemetry</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Context Window</span>
                <span className="text-slate-300">6 messages</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Spacecraft Data</span>
                <span className="text-emerald-400">5 monitored</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
