function parseTimestamp(ts) {
  if (typeof ts === 'number') {
    return new Date(ts);
  }
  if (typeof ts === 'string') {
    return new Date(ts);
  }
  return new Date();
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function formatTokenCount(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

module.exports = { parseTimestamp, formatDuration, formatTime, formatTokenCount };
