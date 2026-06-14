export function formatDateFull(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

export function formatDurationMins(startMs: number, endMs: number | null): number {
  if (!endMs) return 0;
  return Math.floor((endMs - startMs) / 60000);
}

export function formatDistKm(metres: number): string {
  return (metres / 1000).toFixed(1);
}

export function formatSpeedKmph(ms: number): string {
  return (ms * 3.6).toFixed(1);
}
