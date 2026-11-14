import { useEffect, useState } from 'react';
import { api } from '../api/endpoints';
import type { JobEventRecord, Transaction } from '../types/contract';

export function useJobStream(jobId: string | null, onFinished?: (tx?: Transaction) => void) {
  const [events, setEvents] = useState<JobEventRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalDecision, setFinalDecision] = useState<'recorded' | 'needs_review' | null>(null);
  const [resultTransaction, setResultTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!jobId) {
      setEvents([]);
      setIsRunning(false);
      setFinalDecision(null);
      setResultTransaction(null);
      return;
    }

    setEvents([]);
    setIsRunning(true);
    setFinalDecision(null);
    setResultTransaction(null);

    let closed = false;
    let pollTimer: number | null = null;

    const handleEvent = (ev: JobEventRecord) => {
      setEvents((prev) => {
        if (prev.some((x) => x.seq === ev.seq && x.step === ev.step)) {
          return prev;
        }
        return [...prev, ev].sort((a, b) => a.seq - b.seq);
      });

      if (ev.step === 'done' || ev.step === 'error') {
        setIsRunning(false);
        const dec = (ev.data?.decision as 'recorded' | 'needs_review') || null;
        setFinalDecision(dec);
        const tx = (ev.data?.transaction as Transaction) || null;
        if (tx) {
          setResultTransaction(tx);
        }
        if (onFinished) {
          onFinished(tx || undefined);
        }
      }
    };

    const startPolling = () => {
      const poll = async () => {
        if (closed) return;
        try {
          const job = await api.getJob(jobId);
          for (const ev of job.events) {
            handleEvent(ev);
          }
          if (job.status !== 'done' && job.status !== 'error' && !closed) {
            pollTimer = window.setTimeout(poll, 700);
          }
        } catch {
          if (!closed) {
            pollTimer = window.setTimeout(poll, 1200);
          }
        }
      };
      poll();
    };

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as JobEventRecord;
        handleEvent(parsed);
        if (parsed.step === 'done' || parsed.step === 'error') {
          es.close();
        }
      } catch {
        // ignore parse error
      }
    };
    es.onerror = () => {
      es.close();
      if (!closed) {
        startPolling();
      }
    };

    return () => {
      closed = true;
      es.close();
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [jobId]);

  return { events, isRunning, finalDecision, resultTransaction };
}
