/**
 * DOM içeriği tamamen yüklendiğinde durum çubuğu işlevlerini başlatır.
 * Gerekli DOM öğelerini alır, başlangıç durum metinlerini ayarlar ve
 * ana süreçten gelen uzak sistem bilgisi güncellemelerini ve temizleme olaylarını dinler.
 */
document.addEventListener('DOMContentLoaded', () => {
  const cpuElement = document.getElementById('cpuUsage');
  const memElement = document.getElementById('memUsage');
  const diskElement = document.getElementById('diskUsage');

  /**
   * Durum çubuğundaki CPU, Bellek ve Disk kullanım bilgilerini
   * varsayılan "N/A" (Not Available/Mevcut Değil) durumuna sıfırlar.
   */
  const setDefaultStatusText = () => {
    if (cpuElement) cpuElement.textContent = '💻 CPU: N/A';
    if (memElement) memElement.textContent = '🧠 MEM: N/A';
    if (diskElement) diskElement.textContent = '💾 Disk: N/A';
  };

  if (!cpuElement || !memElement || !diskElement) {
    console.error('Arayüz: Durum çubuğu elementlerinden biri (cpuUsage, memUsage, diskUsage) bulunamadı!');
    return;
  }

  setDefaultStatusText();

  let currentDisplayingConnectionId = null;

  /**
   * Ana süreçten `remote-system-info-update` olayı geldiğinde tetiklenir.
   * Gelen verilerle (CPU, bellek, disk kullanımı) durum çubuğunu günceller.
   * @param {Object} data - Uzak sistem bilgilerini içeren nesne.
   * @param {string} data.connectionId - Bilginin ait olduğu bağlantının ID'si.
   * @param {number} [data.cpu] - Sunucu CPU kullanım yüzdesi.
   * @param {number} [data.mem] - Sunucu Bellek kullanım yüzdesi.
   * @param {number} [data.memTotalMB] - Sunucudaki toplam bellek (MB).
   * @param {number} [data.memUsedMB] - Sunucudaki kullanılan bellek (MB).
   * @param {number} [data.disk] - Sunucu Disk kullanım yüzdesi.
   * @param {number} [data.diskTotalMB] - Sunucudaki toplam disk alanı (MB).
   * @param {number} [data.diskUsedMB] - Sunucudaki kullanılan disk alanı (MB).
   */
  if (window.api && window.api.onRemoteSystemInfoUpdate) {
    console.log('Arayüz (DOM Hazır): Uzak sistem bilgisi olayına abone olunuyor.');
    
    window.api.onRemoteSystemInfoUpdate((data) => {
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

  /**
   * Ana süreçten `clear-remote-system-info` olayı geldiğinde tetiklenir.
   * Eğer temizleme olayı o an görüntülenen bağlantıya aitse, durum çubuğunu varsayılan metinlere sıfırlar.
   * @param {Object} data - Temizleme olay verisini içeren nesne.
   * @param {string} data.connectionId - Sistem bilgileri temizlenen bağlantının ID'si.
   */
  if (window.api && window.api.onClearRemoteSystemInfo) {
    window.api.onClearRemoteSystemInfo((data) => {
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