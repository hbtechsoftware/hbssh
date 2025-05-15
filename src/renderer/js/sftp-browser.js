const fileEditorModal = document.getElementById('fileEditorModal');
const fileEditorTextareaEl = document.getElementById('fileEditorTextarea');
const saveFileButtonEl = document.getElementById('saveFileButton');
const closeFileEditorModalButton = document.getElementById('closeFileEditorModal');
const cancelFileEditButtonEl = document.getElementById('cancelFileEditButton');
const fileEditorTitleEl = document.getElementById('fileEditorTitle');
let editingFilePath = null;
let sftpCurrentSshConnectionId = null; // SFTP'nin hangi SSH bağlantısına ait olduğunu bilmek için (eski currentSshConnectionId yerine bu kullanılacak)

let sftpConnectionId = null;
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

sftpFileListElement.addEventListener('click', async (event) => {
  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name) return;

  const itemName = listItem.dataset.name;
  const itemType = listItem.dataset.type;
  // const currentTab = document.querySelector('.tab.active'); // Aktif sekmeyi al
  // const activeSshConnectionId = currentTab ? currentTab.dataset.connectionId : null;


  if (!sftpCurrentSshConnectionId) { // sftpCurrentSshConnectionId kontrolü
      console.warn("SFTP operation attempted without a valid SSH connection context for SFTP.");
      alert("SFTP için geçerli bir bağlantı bulunamadı.");
      return;
  }
  // Opsiyonel: Eğer sekmeli bir yapı varsa ve aktif sekmeyle eşleşme kontrolü gerekiyorsa:
  // if (activeSshConnectionId !== sftpCurrentSshConnectionId) {
  //     console.warn("SFTP operation attempted on a non-matching or inactive tab's SFTP instance.");
  //     return;
  // }


  let fullPath = currentRemotePath;
  if (fullPath === '/') {
    fullPath += itemName;
  } else {
    fullPath += `/${itemName}`;
  }

  if (itemType === 'd') { // Klasöre tıklandı
    fetchAndDisplayDirectory(fullPath);
  } else if (itemType === 'f') { // Dosyaya tıklandı
    if (!sftpConnectionId) {
        alert('SFTP bağlı değil!');
        return;
    }
    console.log(`File clicked: ${fullPath}, sftp ID: ${sftpConnectionId}, ssh ID: ${sftpCurrentSshConnectionId}`);
    try {
        showLoading(true); // Yükleniyor göstergesi
        const result = await window.api.sftpReadFile(sftpConnectionId, fullPath);
        showLoading(false);

        if (result.success) {
            if (fileEditorTextareaEl) fileEditorTextareaEl.value = result.content;
            editingFilePath = fullPath;
            if (fileEditorTitleEl) fileEditorTitleEl.textContent = itemName;
            if (fileEditorModal) fileEditorModal.style.display = 'block';
        } else {
            console.error('Error reading file:', result.error);
            alert(`Dosya okunamadı: ${result.error}`);
        }
    } catch (error) {
        showLoading(false);
        console.error('Failed to request sftpReadFile:', error);
        alert(`Dosya okuma isteği başarısız: ${error.message}`);
    }
  }
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
    // Gelen sftpConnectionId'nin hangi sshConnectionId'ye ait olduğunu bilmemiz lazım.
    // Bu bilgi main.js'den sftp-ready ile birlikte gönderilmeli.
    if (data.sshConnectionId) {
        sftpCurrentSshConnectionId = data.sshConnectionId;
    } else {
        console.warn("SFTP Ready event received without sshConnectionId. Editor context might be broken.");
        // Bu durumda editörün hangi bağlantı için olduğunu bilemeyiz.
        // Belki de sftpConnectionId zaten global olarak unique ve yeterlidir.
        // Şimdilik main.js'in sshConnectionId gönderdiğini varsayıyoruz.
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
    // Kapatma olayını sftpConnectionId ile veya sshConnectionId ile eşleştir
    if (data.sftpConnectionId === sftpConnectionId || (data.sshConnectionId && data.sshConnectionId === sftpCurrentSshConnectionId) ) {
      console.log('SFTP Close event received for current session:', data);
      sftpConnectionId = null;
      sftpCurrentSshConnectionId = null; // Bunu da temizle
      currentRemotePath = '';
      sftpStatusElement.textContent = 'SFTP: Bağlı Değil';
      sftpCurrentPathElement.value = '';
      sftpFileListElement.innerHTML = '';
      closeFileEditor(); // Editör açıksa kapat
    }
  });
} else {
    console.warn('window.api.onSftpClose bulunamadı!');
}

// Dosya editörü için yeni fonksiyonlar (script sonuna eklenebilir):
function closeFileEditor() {
    if (fileEditorModal) {
        fileEditorModal.style.display = 'none';
        if (fileEditorTextareaEl) fileEditorTextareaEl.value = '';
        editingFilePath = null;
        if (fileEditorTitleEl) fileEditorTitleEl.textContent = 'Dosya Düzenle';
    }
}

if (saveFileButtonEl) {
    saveFileButtonEl.addEventListener('click', async () => {
        if (!editingFilePath || !sftpConnectionId) {
            alert('Kaydedilecek dosya veya SFTP bağlantısı bulunamadı.');
            return;
        }
        const newContent = fileEditorTextareaEl.value;
        try {
            const result = await window.api.sftpWriteFile(sftpConnectionId, editingFilePath, newContent);
            if (result.success) {
                alert('Dosya başarıyla kaydedildi!');
                closeFileEditor();
            } else {
                console.error('Error writing file:', result.error);
                alert(`Dosya kaydedilemedi: ${result.error}`);
            }
        } catch (error) {
            console.error('Failed to request sftpWriteFile:', error);
            alert(`Dosya kaydetme isteği başarısız: ${error.message}`);
        }
    });
}

if (closeFileEditorModalButton) {
    closeFileEditorModalButton.addEventListener('click', () => {
        closeFileEditor();
    });
}

if (cancelFileEditButtonEl) {
    cancelFileEditButtonEl.addEventListener('click', () => {
        closeFileEditor();
    });
}

console.log('SFTP Browser script loaded and editor functions added.'); 