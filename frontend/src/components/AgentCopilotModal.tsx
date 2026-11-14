import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AppIcon } from '@/components/AppIcon';
import { api } from '../api/endpoints';
import type { AgentChatToolCall } from '../types/contract';

interface ChatTurn {
  role: 'user' | 'agent';
  text: string;
  toolCalls?: AgentChatToolCall[];
  followups?: string[];
  dataUpdated?: boolean;
}

interface AgentCopilotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month?: string;
  onDataChanged: () => void;
}

const QUICK_PROMPTS = [
  'Tháng này thu chi, thuế ước tính và hồ sơ vay vốn ra sao?',
  'Tuần này chi nhiều nhất cho khoản nào và có biến động giá bất thường không?',
  'Kiểm tra xem còn chứng từ nào nghi trùng hoặc cần tôi xác nhận không?',
  'Gộp giúp tôi chứng từ nghi trùng đang chờ kiểm tra.',
];

export function AgentCopilotModal({
  open,
  onOpenChange,
  month = '2026-11',
  onDataChanged,
}: AgentCopilotModalProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      role: 'agent',
      text: 'Chào anh/chị! Em là trợ lý sổ sách Keiki AI. Anh/chị có thể hỏi số liệu thu chi, tìm khoản chi lớn, kiểm tra ngưỡng doanh thu thuế hoặc nhờ em gộp chứng từ nghi trùng.',
    },
  ]);

  const sendPrompt = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || busy) return;

    setError(null);
    setBusy(true);
    setTurns((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');

    try {
      const res = await api.chatWithAgent(trimmed, month);
      setTurns((prev) => [
        ...prev,
        {
          role: 'agent',
          text: res.reply,
          toolCalls: res.tool_calls,
          followups: res.suggested_followups,
          dataUpdated: res.data_updated,
        },
      ]);
      if (res.data_updated) {
        onDataChanged();
      }
    } catch (err) {
      setError((err as Error).message || 'Không thể kết nối tới trợ lý Keiki Agent.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col p-5 sm:max-w-2xl">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#111625]">
            <AppIcon name="psychology" className="text-xl text-[#2E2396]" />
            Hỏi đáp &amp; Điều phối Keiki AI Agent (Function Calling)
          </DialogTitle>
          <DialogDescription className="text-xs text-[#475569]">
            Agent gọi công cụ truy vấn sổ cái, tính toán nghĩa vụ thuế và thực thi thao
            tác gộp chứng từ có nhật ký kiểm toán.
          </DialogDescription>
        </DialogHeader>

        {/* Quick 1-tap question chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => sendPrompt(q)}
              className="cursor-pointer rounded-full bg-[#F6F8FB] px-3 py-1.5 text-left text-xs font-medium text-[#2E2396] transition hover:bg-[#ECEFF7] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Conversation history */}
        <div className="min-h-[220px] flex-1 space-y-3 overflow-y-auto rounded-xl bg-[#F6F8FB] p-3.5">
          {turns.map((turn, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  turn.role === 'user'
                    ? 'bg-[#2E2396] text-white'
                    : 'bg-white text-[#111625] shadow-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{turn.text}</div>

                {turn.toolCalls && turn.toolCalls.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 border-t border-border/70 pt-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[#475569]">
                      <AppIcon name="terminal" className="text-xs text-[#0B6E54]" />
                      <span>Công cụ Agent đã thực thi:</span>
                      {turn.dataUpdated && (
                        <Badge variant="emerald" className="text-[10px] font-bold">
                          Đã cập nhật Sổ cái
                        </Badge>
                      )}
                    </div>
                    {turn.toolCalls.map((tc, tIdx) => (
                      <div
                        key={`${tc.tool_name}-${tIdx}`}
                        className="rounded-lg bg-[#F6F8FB] px-2.5 py-1.5 font-mono text-[11px] text-[#334155]"
                      >
                        <span className="font-bold text-[#2E2396]">{tc.tool_name}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-sans text-[#475569]">{tc.result_summary}</span>
                      </div>
                    ))}
                  </div>
                )}

                {turn.followups && turn.followups.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {turn.followups.map((f) => (
                      <button
                        key={f}
                        type="button"
                        disabled={busy}
                        onClick={() => sendPrompt(f)}
                        className="cursor-pointer rounded-full bg-[#ECEFF7] px-2.5 py-1 text-[11px] font-semibold text-[#2E2396] hover:bg-[#dfe4f2]"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#2E2396] shadow-xs">
              <AppIcon name="pending" className="text-sm" />
              Keiki Agent đang gọi công cụ kiểm tra sổ sách...
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3.5 py-2 text-xs font-medium text-[#B91C1C]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ví dụ: Tuần này chi gì nhiều nhất? Hoặc: gộp chứng từ trùng..."
            disabled={busy}
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
            <AppIcon name="send" className="text-base" />
            Gửi
          </Button>
        </form>

        <DialogFooter className="border-t border-border pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
