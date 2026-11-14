let currentAudio: HTMLAudioElement | null = null;
let stopRequested = false;

function splitSentences(text: string, maxLen = 170): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const rawParts = cleaned.split(/(?<=[\.\!\?\;\,\:])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const part of rawParts) {
    if (!part) continue;
    if ((current ? `${current} ${part}` : part).length <= maxLen) {
      current = current ? `${current} ${part}` : part;
    } else {
      if (current) chunks.push(current);
      if (part.length <= maxLen) {
        current = part;
      } else {
        const words = part.split(' ');
        let sub = '';
        for (const w of words) {
          if ((sub ? `${sub} ${w}` : w).length <= maxLen) {
            sub = sub ? `${sub} ${w}` : w;
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function stopSpeakingVietnamese(): void {
  stopRequested = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function speakVietnamese(text: string): Promise<void> {
  if (!text || !text.trim()) return;
  stopSpeakingVietnamese();
  stopRequested = false;

  const chunks = splitSentences(text, 165);
  for (const chunk of chunks) {
    if (stopRequested) return;
    const url = `/api/tts?text=${encodeURIComponent(chunk)}`;
    const playedOk = await new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.playbackRate = 1.02;
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });

    // Fallback ONLY if native Vietnamese voice ('vi') is installed on OS — never use English voice!
    if (!playedOk && !stopRequested && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
      if (viVoice) {
        const u = new SpeechSynthesisUtterance(chunk);
        u.voice = viVoice;
        u.lang = 'vi-VN';
        window.speechSynthesis.speak(u);
      }
    }
  }
}
