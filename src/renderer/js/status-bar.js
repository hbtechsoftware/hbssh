document.addEventListener('DOMContentLoaded', () => {
  const cpuElement = document.getElementById('cpuUsage');
  const memElement = document.getElementById('memUsage');
  const diskElement = document.getElementById('diskUsage');

  // Başlangıçta durum çubuğunu temizle veya bir varsayılan mesaj göster
  const setDefaultStatusText = () => {
    if (cpuElement) cpuElement.textContent = '💻 CPU: N/A';
    if (memElement) memElement.textContent = '🧠 MEM: N/A';
    if (diskElement) diskElement.textContent = '💾 Disk: N/A';
  };

  if (!cpuElement || !memElement || !diskElement) {
    console.error('Arayüz: Durum çubuğu elementlerinden biri (cpuUsage, memUsage, diskUsage) bulunamadı!');
    return;
  }

  setDefaultStatusText(); // Başlangıç durumu

  let currentDisplayingConnectionId = null;

  if (window.api && window.api.onRemoteSystemInfoUpdate) {
    console.log('Arayüz (DOM Hazır): Uzak sistem bilgisi olayına abone olunuyor.');
    
    window.api.onRemoteSystemInfoUpdate((data) => {
      // console.log('Arayüz (DOM Hazır): Uzak sistem bilgisi verisi alındı:', data);
      currentDisplayingConnectionId = data.connectionId;

      if (cpuElement) {
        if (typeof data.cpu === 'number' && !isNaN(data.cpu)) {
          cpuElement.textContent = `💻 Sunucu CPU: ${data.cpu.toFixed(1)}%`;
        } else {
          cpuElement.textContent = '💻 Sunucu CPU: N/A';
        }
      }

      if (memElement) {
        if (typeof data.mem === 'number' && !isNaN(data.mem) &&
            typeof data.memTotalMB === 'number' && !isNaN(data.memTotalMB) &&
            typeof data.memUsedMB === 'number' && !isNaN(data.memUsedMB)) {
          memElement.textContent = `🧠 Sunucu MEM: ${data.mem.toFixed(1)}% (${data.memUsedMB}MB / ${data.memTotalMB}MB)`;
        } else {
          memElement.textContent = '🧠 Sunucu MEM: N/A';
        }
      }

      if (diskElement) {
        if (typeof data.disk === 'number' && !isNaN(data.disk) &&
            typeof data.diskTotalMB === 'number' && !isNaN(data.diskTotalMB) &&
            typeof data.diskUsedMB === 'number' && !isNaN(data.diskUsedMB)) {
          diskElement.textContent = `💾 Sunucu Disk: ${data.disk}% (${data.diskUsedMB}MB / ${data.diskTotalMB}MB)`;
        } else {
          diskElement.textContent = '💾 Sunucu Disk: N/A';
        }
      }
    });
  } else {
    console.error('Arayüz (DOM Hazır): Uzak sistem bilgisi API (onRemoteSystemInfoUpdate) bulunamadı.');
    setDefaultStatusText();
  }

  if (window.api && window.api.onClearRemoteSystemInfo) {
    window.api.onClearRemoteSystemInfo((data) => {
      // Sadece o an gösterilen bağlantının bilgileri temizleniyorsa durumu sıfırla
      if (data.connectionId === currentDisplayingConnectionId) {
        console.log(`Arayüz: [${data.connectionId}] için uzak sistem bilgileri temizleniyor.`);
        setDefaultStatusText();
        currentDisplayingConnectionId = null;
      }
    });
  } else {
    console.error('Arayüz (DOM Hazır): Uzak sistem bilgisi temizleme API (onClearRemoteSystemInfo) bulunamadı.');
  }
}); 