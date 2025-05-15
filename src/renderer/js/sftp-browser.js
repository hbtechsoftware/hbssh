let sftpConnectionId = null;
let currentSshConnectionId = null; // Aktif SSH seansının ID'sini tutmak için
let currentRemotePath = '';

const sftpStatusElement = document.getElementById('sftpConnectionStatus');
const sftpUpButton = document.getElementById('sftpUpButton');
const sftpCurrentPathElement = document.getElementById('sftpCurrentPath');
const sftpFileListElement = document.getElementById('sftpFileList');
const sftpLoadingIndicator = document.getElementById('sftpLoadingIndicator');
// const sftpConnectBtn = document.getElementById('sftpConnectBtn'); // İleride manuel bağlantı için

function showLoading(isLoading) {
  if (sftpLoadingIndicator) {
    sftpLoadingIndicator.style.display = isLoading ? 'block' : 'none';
  }
  if (sftpFileListElement && isLoading) {
    sftpFileListElement.innerHTML = ''; // Yüklenirken eski listeyi temizle
  }
}

async function fetchAndDisplayDirectory(pathToList) {
  if (!sftpConnectionId) {
    sftpStatusElement.textContent = 'SFTP: Bağlı Değil';
    sftpFileListElement.innerHTML = '<li>SFTP bağlantısı yok.</li>';
    return;
  }

  showLoading(true);
  try {
    console.log(`SFTP: Listing directory: ${pathToList} for sftp ID: ${sftpConnectionId}`);
    const result = await window.api.sftpList(sftpConnectionId, pathToList);
    showLoading(false);

    if (result && result.success && Array.isArray(result.list)) {
      currentRemotePath = pathToList;
      sftpCurrentPathElement.value = currentRemotePath;
      sftpFileListElement.innerHTML = ''; // Önceki listeyi temizle

      // Dosya ve klasörleri ayırıp önce klasörleri listele
      const directories = result.list.filter(item => item.type === 'd' || item.type === 'l'); // l: sembolik link (klasör olabilir)
      const files = result.list.filter(item => item.type === '-' || (item.type === 'l' && !directories.includes(item)));

      directories.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      if (directories.length === 0 && files.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.textContent = 'Klasör boş.';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.cursor = 'default';
        sftpFileListElement.appendChild(emptyMessage);
      }

      directories.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📁</span> ${item.name}`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'd'; // Klasör
        listItem.title = `${item.name} (Klasör)`;
        sftpFileListElement.appendChild(listItem);
      });

      files.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📄</span> ${item.name}`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'f'; // Dosya
        listItem.title = `${item.name} (Dosya)`; // İleride boyut vb. eklenebilir
        sftpFileListElement.appendChild(listItem);
      });
    } else {
      sftpFileListElement.innerHTML = `<li>Hata: ${result.error || 'Dosyalar listelenemedi.'}</li>`;
      console.error('SFTP list error:', result.error);
    }
  } catch (error) {
    showLoading(false);
    sftpFileListElement.innerHTML = `<li>İstek hatası: ${error.message}</li>`;
    console.error('SFTP list request error:', error);
  }
}

sftpFileListElement.addEventListener('click', (event) => {
  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name) return;

  const itemName = listItem.dataset.name;
  const itemType = listItem.dataset.type;

  if (itemType === 'd') { // Klasöre tıklandı
    let newPath = currentRemotePath;
    if (newPath === '/') {
      newPath += itemName;
    } else {
      newPath += `/${itemName}`;
    }
    fetchAndDisplayDirectory(newPath);
  }
  // Dosyaya tıklama olayı ileride eklenebilir (örn: indirme başlat)
});

sftpUpButton.addEventListener('click', () => {
  if (currentRemotePath === '/' || !currentRemotePath) return;
  let parentPath = currentRemotePath.substring(0, currentRemotePath.lastIndexOf('/'));
  if (parentPath === '') parentPath = '/'; // Kök dizine çıkıyorsak
  fetchAndDisplayDirectory(parentPath);
});

// Ana işlemden SFTP bağlantısının hazır olduğuna dair mesajı dinle
if (window.api && window.api.onSftpReady) {
  window.api.onSftpReady(async (data) => {
    console.log('SFTP Ready event received:', data);
    if (data.sshConnectionId) { // Sadece belirli bir SSH bağlantısı içinse
        currentSshConnectionId = data.sshConnectionId;
        // Burada, bu sftp-browser'ın gerçekten bu sshConnectionId için mi 
        // gösterilmesi gerektiğini kontrol eden bir mantık eklenebilir (çoklu sekme durumunda).
        // Şimdilik gelen her sftp-ready olayına tepki veriyoruz.
    }
    sftpConnectionId = data.sftpConnectionId;
    sftpStatusElement.textContent = 'SFTP: Bağlandı';
    sftpCurrentPathElement.value = data.initialPath || '/';
    await fetchAndDisplayDirectory(data.initialPath || '/');
  });
} else {
    console.warn('window.api.onSftpReady bulunamadı!');
}

// Ana işlemden SFTP bağlantısının kesildiğine dair mesajı dinle
if (window.api && window.api.onSftpClose) {
  window.api.onSftpClose((data) => {
    // Sadece o an aktif olan bağlantı içinse temizle
    if (data.sftpConnectionId === sftpConnectionId || (data.sshConnectionId && data.sshConnectionId === currentSshConnectionId) ) {
      console.log('SFTP Close event received for current session:', data);
      sftpConnectionId = null;
      currentSshConnectionId = null;
      currentRemotePath = '';
      sftpStatusElement.textContent = 'SFTP: Bağlı Değil';
      sftpCurrentPathElement.value = '';
      sftpFileListElement.innerHTML = '';
    }
  });
} else {
    console.warn('window.api.onSftpClose bulunamadı!');
}

console.log('SFTP Browser script loaded.'); 