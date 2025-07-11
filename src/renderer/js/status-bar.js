/**
 * Initializes status bar functions when the DOM content is fully loaded.
 * Gets necessary DOM elements, sets initial status texts, and
 * listens for remote system information updates and clear events from the main process.
 */
document.addEventListener('DOMContentLoaded', () => {
  const cpuElement = document.getElementById('cpuUsage');
  const memElement = document.getElementById('memUsage');
  const diskElement = document.getElementById('diskUsage');

  /**
   * Resets the CPU, Memory, and Disk usage information in the status bar
   * to the default "N/A" (Not Available) state.
   */
  const setDefaultStatusText = () => {
    if (cpuElement) cpuElement.textContent = '💻 Load: N/A';
    if (memElement) memElement.textContent = '🧠 MEM: N/A';
    if (diskElement) diskElement.textContent = '💾 Disk: N/A';
  };

  /**
   * Shows debug information in the status bar
   */
  const showDebugInfo = (message) => {
    if (cpuElement) cpuElement.textContent = `💻 Debug: ${message}`;
    if (memElement) memElement.textContent = `🧠 Debug: Veri bekleniyor...`;
    if (diskElement) diskElement.textContent = `💾 Debug: Sistem analizi...`;
  };

  if (!cpuElement || !memElement || !diskElement) {
    console.error('UI: One of the status bar elements (cpuUsage, memUsage, diskUsage) not found!');
    return;
  }

  setDefaultStatusText();

  let currentDisplayingConnectionId = null;

  /**
   * Triggered when the `remote-system-info-update` event is received from the main process.
   * Updates the status bar with the received data (CPU, memory, disk usage).
   * @param {Object} data - Object containing remote system information.
   * @param {string} data.connectionId - The ID of the connection to which the information belongs.
   * @param {number} [data.cpu] - Server CPU usage percentage.
   * @param {number} [data.mem] - Server Memory usage percentage.
   * @param {number} [data.memTotalMB] - Total memory on the server (MB).
   * @param {number} [data.memUsedMB] - Used memory on the server (MB).
   * @param {number} [data.disk] - Server Disk usage percentage.
   * @param {number} [data.diskTotalMB] - Total disk space on the server (MB).
   * @param {number} [data.diskUsedMB] - Used disk space on the server (MB).
   * @param {string} [data.debug] - Debug message for troubleshooting.
   * @param {string} [data.osType] - Operating system type.
   */
  if (window.api && window.api.onRemoteSystemInfoUpdate) {
    
    window.api.onRemoteSystemInfoUpdate((data) => {
      currentDisplayingConnectionId = data.connectionId;
      
      if (data.debug) {
        showDebugInfo(data.debug);
        return;
      }

      if (cpuElement) {
        if (typeof data.cpu === 'number' && !isNaN(data.cpu)) {
          cpuElement.textContent = `💻 Server Load: ${data.cpu.toFixed(1)}%`;
        } else {
          cpuElement.textContent = '💻 Server Load: N/A';
        }
      }

      if (memElement) {
        if (typeof data.mem === 'number' && !isNaN(data.mem) &&
            typeof data.memTotalMB === 'number' && !isNaN(data.memTotalMB) &&
            typeof data.memUsedMB === 'number' && !isNaN(data.memUsedMB)) {
          memElement.textContent = `🧠 Server MEM: ${data.mem.toFixed(1)}% (${data.memUsedMB}MB / ${data.memTotalMB}MB)`;
        } else {
          memElement.textContent = '🧠 Server MEM: N/A';
        }
      }

      if (diskElement) {
        if (typeof data.disk === 'number' && !isNaN(data.disk) &&
            typeof data.diskTotalMB === 'number' && !isNaN(data.diskTotalMB) &&
            typeof data.diskUsedMB === 'number' && !isNaN(data.diskUsedMB)) {
          diskElement.textContent = `💾 Server Disk: ${data.disk}% (${data.diskUsedMB}MB / ${data.diskTotalMB}MB)`;
        } else {
          diskElement.textContent = '💾 Server Disk: N/A';
        }
      }
    });
  } else {
    console.error('UI (DOM Ready): Remote system info API (onRemoteSystemInfoUpdate) not found.');
    setDefaultStatusText();
  }

  /**
   * Triggered when the `clear-remote-system-info` event is received from the main process.
   * If the clear event belongs to the currently displayed connection, resets the status bar to default texts.
   * @param {Object} data - Object containing the clear event data.
   * @param {string} data.connectionId - The ID of the connection whose system information is cleared.
   */
  if (window.api && window.api.onClearRemoteSystemInfo) {
    window.api.onClearRemoteSystemInfo((data) => {
      if (data.connectionId === currentDisplayingConnectionId) {
        setDefaultStatusText();
        currentDisplayingConnectionId = null;
      }
    });
  } else {
    console.error('UI (DOM Ready): Remote system info clear API (onClearRemoteSystemInfo) not found.');
  }
}); 