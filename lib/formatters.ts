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

export function formatTime12h(ms: number): string {
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

export function formatDurationHuman(startMs: number, endMs: number | null): string {
  if (!endMs) return "In progress";
  const totalSec = Math.floor((endMs - startMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDistKm(metres: number): string {
  return (metres / 1000).toFixed(1);
}

export function formatDistHuman(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatSpeedKmph(ms: number): string {
  return (ms * 3.6).toFixed(1);
}
