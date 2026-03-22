/**
 * Returns high-resolution CPU consumption data for the current process.
 * Returns an object with 'user' and 'system' fields representing CPU time in microseconds.
 * 
 * @returns {{ user: number; system: number }} The CPU usage of the current process.
 */
export function getCPUUsage(): { user: number; system: number } {
  return process.cpuUsage();
}

/**
 * Returns the number of seconds the current Node.js process has been running.
 * 
 * @returns {number} The process uptime in seconds.
 */
export function getUptime(): number {
  return process.uptime();
}

/**
 * Formats a byte count into a human-readable string (KB, MB, GB).
 * 
 * @param {number} bytes The number of bytes to format.
 * @param {number} [decimals=2] The number of decimal places to display.
 * @returns {string} The formatted string (e.g., '1.5 KB').
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}