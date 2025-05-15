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

const sftpUploadBtn = document.getElementById('sftpUploadBtn');
const sftpDownloadBtn = document.getElementById('sftpDownloadBtn');
const sftpDeleteBtn = document.getElementById('sftpDeleteBtn');
const sftpNewFileBtn = document.getElementById('sftpNewFileBtn');
const sftpNewFolderBtn = document.getElementById('sftpNewFolderBtn');

let selectedSftpItem = null; // { element: HTMLLIElement, name: string, type: 'f'|'d', path: string }

// Yardımcı fonksiyon: Tam dosya/klasör yolu oluşturur
function buildItemPath(itemName) {
    if (!currentRemotePath) {
        console.warn('[SFTP Browser] buildItemPath called with no currentRemotePath');
        return itemName; // Bu durum normalde olmamalı
    }
    return (currentRemotePath === '/' ? '/' : currentRemotePath + '/') + itemName;
}

function showLoading(isLoading) {
  if (sftpLoadingIndicator) {
    sftpLoadingIndicator.style.display = isLoading ? 'block' : 'none';
  }
  if (sftpFileListElement && isLoading) {
    sftpFileListElement.innerHTML = ''; // Yüklenirken eski listeyi temizle
  }
}

async function fetchAndDisplayDirectory(pathToList, nameToFocus = null) {
  console.log(`[SFTP Browser] Fetching directory: ${pathToList}. Item to focus: ${nameToFocus || 'N/A'}`);
  if (!sftpConnectionId) {
    sftpStatusElement.textContent = 'SFTP: Bağlı Değil';
    sftpFileListElement.innerHTML = '<li>SFTP bağlantısı yok.</li>';
    selectedSftpItem = null;
    updateSftpActionButtonsState();
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

      console.log('[SFTP Browser] Directories found:', directories.map(d => d.name));
      console.log('[SFTP Browser] Files found:', files.map(f => f.name));

      if (directories.length === 0 && files.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.textContent = 'Klasör boş.';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.cursor = 'default';
        sftpFileListElement.appendChild(emptyMessage);
      }

      directories.forEach(item => {
        const listItem = document.createElement('li');
        // İsim için ayrı bir span eklemek yeniden adlandırmayı kolaylaştırır:
        listItem.innerHTML = `<span class="icon">📁</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'd'; // Klasör
        listItem.title = `${item.name} (Klasör)`;
        sftpFileListElement.appendChild(listItem);
      });

      files.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📄</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'f'; // Dosya
        listItem.title = `${item.name} (Dosya)`; // İleride boyut vb. eklenebilir
        sftpFileListElement.appendChild(listItem);
      });
    } else {
      sftpFileListElement.innerHTML = `<li>Hata: ${result.error || 'Dosyalar listelenemedi.'}</li>`;
      console.error('[SFTP Browser] SFTP list API error:', result.error);
    }
  } catch (error) {
    showLoading(false);
    sftpFileListElement.innerHTML = `<li>İstek hatası: ${error.message}</li>`;
    console.error('SFTP list request error:', error);
  } finally {
    showLoading(false); // Her durumda yüklemeyi sonlandır
    selectedSftpItem = null; // Liste yenilendiğinde seçim sıfırlanır
    updateSftpActionButtonsState();
  }
}

sftpFileListElement.addEventListener('dblclick', async (event) => {
  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name || !selectedSftpItem || selectedSftpItem.element !== listItem) return;

  const { name: itemName, type: itemType, path: fullPath } = selectedSftpItem;

  if (!sftpCurrentSshConnectionId) {
      console.warn("SFTP operation attempted without a valid SSH connection context for SFTP.");
      alert("SFTP için geçerli bir bağlantı bulunamadı.");
      return;
  }

  if (itemType === 'd') { // Klasöre çift tıklandı
    fetchAndDisplayDirectory(fullPath);
  } else if (itemType === 'f') { // Dosyaya çift tıklandı (düzenle)
    if (!sftpConnectionId) {
        alert('SFTP bağlı değil!');
        return;
    }
    console.log(`File dblclicked for edit: ${fullPath}, sftp ID: ${sftpConnectionId}`);
    try {
        showLoading(true); 
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

sftpFileListElement.addEventListener('click', (event) => {
  const listItem = event.target.closest('li');
  
  if (selectedSftpItem && selectedSftpItem.element) {
    selectedSftpItem.element.classList.remove('selected');
  }
  selectedSftpItem = null;

  if (!listItem || !listItem.dataset.name) {
    updateSftpActionButtonsState();
    return;
  }

  const itemName = listItem.dataset.name;
  const itemType = listItem.dataset.type;
  listItem.classList.add('selected');
  let fullPath = currentRemotePath;
  if (currentRemotePath === '/') {
    fullPath += itemName;
  } else {
    fullPath += `/${itemName}`;
  }
  selectedSftpItem = { element: listItem, name: itemName, type: itemType, path: fullPath };
  updateSftpActionButtonsState();
});

function updateSftpActionButtonsState() {
    const hasSftpConnection = !!sftpConnectionId;
    const itemIsSelected = !!selectedSftpItem;
    const itemIsFile = itemIsSelected && selectedSftpItem.type === 'f';
    // const itemIsDirectory = itemIsSelected && selectedSftpItem.type === 'd';

    if (sftpUploadBtn) sftpUploadBtn.disabled = !hasSftpConnection;
    if (sftpNewFileBtn) sftpNewFileBtn.disabled = !hasSftpConnection;
    if (sftpNewFolderBtn) sftpNewFolderBtn.disabled = !hasSftpConnection;

    if (sftpDownloadBtn) sftpDownloadBtn.disabled = !(hasSftpConnection && itemIsFile);
    if (sftpDeleteBtn) sftpDeleteBtn.disabled = !(hasSftpConnection && itemIsSelected);
}

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
      selectedSftpItem = null;
      updateSftpActionButtonsState();
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

// --- Yükleme İşlevi ---
if (sftpUploadBtn) {
  sftpUploadBtn.addEventListener('click', async () => {
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP bağlantısı aktif değil.');
      return;
    }
    try {
      const { canceled, filePaths } = await window.api.openFileDialog({
        title: 'Yüklenecek Dosyaları Seçin',
        properties: ['openFile', 'multiSelections'] 
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return;
      }

      showLoading(true);
      let allUploadsSuccessful = true;
      for (const localPath of filePaths) {
        if (!localPath) continue;
        const fileName = localPath.substring(localPath.replace(/\\\\/g, '/').lastIndexOf('/') + 1);
        const remotePath = (currentRemotePath === '/' ? '/' : currentRemotePath + '/') + fileName;
        
        console.log(`SFTP: Uploading ${localPath} to ${remotePath}`);
        try {
          const result = await window.api.sftpUpload(sftpConnectionId, localPath, remotePath);
          if (!result.success) {
            allUploadsSuccessful = false;
            console.error(`Upload failed for ${fileName}: ${result.error}`);
            alert(`'${fileName}' yüklenirken hata: ${result.error}`);
          }
        } catch (uploadError) {
          allUploadsSuccessful = false;
          console.error(`Upload request error for ${fileName}:`, uploadError);
          alert(`'${fileName}' yükleme isteği sırasında hata: ${uploadError.message}`);
        }
      }
      // showLoading(false); // Bu satır fetchAndDisplayDirectory'den önce olmamalı, finally bloğunda zaten var.
      // if (allUploadsSuccessful) { /* alert */ }
      // await fetchAndDisplayDirectory(currentRemotePath); // Bu da finally'ye taşınabilir.
    } catch (error) {
      // showLoading(false); // finally'de var
      console.error('SFTP Upload error:', error);
      alert(`Dosya seçme veya yükleme sırasında genel bir hata: ${error.message}`);
    } finally {
        showLoading(false);
        await fetchAndDisplayDirectory(currentRemotePath); // Listeyi her durumda yenile
    }
  });
}

// --- İndirme İşlevi ---
if (sftpDownloadBtn) {
  sftpDownloadBtn.addEventListener('click', async () => {
    if (!sftpConnectionId || !selectedSftpItem || selectedSftpItem.type !== 'f') {
      alert('Lütfen indirmek için bir dosya seçin.');
      return;
    }
    try {
      const remoteFilePath = selectedSftpItem.path;
      const defaultFileName = selectedSftpItem.name;

      const { canceled, filePath: localPath } = await window.api.saveFileDialog({
        title: 'Dosyayı Kaydet',
        defaultPath: defaultFileName
      });

      if (canceled || !localPath) {
        return;
      }
      
      showLoading(true);
      console.log(`SFTP: Downloading ${remoteFilePath} to ${localPath}`);
      const result = await window.api.sftpDownload(sftpConnectionId, remoteFilePath, localPath);
      showLoading(false); // İşlem bittikten sonra yüklemeyi kapat

      if (result.success) {
        alert(`'${defaultFileName}' başarıyla indirildi.`);
      } else {
        console.error('Download failed:', result.error);
        alert(`Dosya indirilemedi: ${result.error}`);
      }
    } catch (error) {
      showLoading(false); // Hata durumunda da yüklemeyi kapat
      console.error('SFTP Download error:', error);
      alert(`İndirme sırasında hata: ${error.message}`);
    }
  });
}

// --- Silme İşlevi ---
if (sftpDeleteBtn) {
  sftpDeleteBtn.addEventListener('click', async () => {
    if (!sftpConnectionId || !selectedSftpItem) {
      alert('Lütfen silmek için bir dosya veya klasör seçin.');
      return;
    }

    const itemPath = selectedSftpItem.path;
    const itemName = selectedSftpItem.name;
    const itemType = selectedSftpItem.type;
    const typeText = itemType === 'd' ? 'klasörü' : 'dosyası';

    const confirm = await window.api.showConfirmDialog({
      title: 'Silme Onayı',
      message: `'${itemName}' ${typeText} silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      buttons: ['Sil', 'İptal'],
      defaultId: 1, 
      cancelId: 1
    });

    if (confirm.response !== 0) { 
      return;
    }
    
    // showLoading(true); // Bu finally'ye taşınabilir
    try {
      showLoading(true);
      let result;
      if (itemType === 'd') { 
        console.log(`SFTP: Deleting directory ${itemPath}`);
        result = await window.api.sftpRmdir(sftpConnectionId, itemPath, true); 
      } else { 
        console.log(`SFTP: Deleting file ${itemPath}`);
        result = await window.api.sftpDelete(sftpConnectionId, itemPath);
      }
      // showLoading(false); // finally'de var
      if (result.success) {
        // alert(`'${itemName}' başarıyla silindi.`);
      } else {
        console.error('Delete failed:', result.error);
        alert(`Silme hatası: ${result.error}`);
      }
    } catch (error) {
      // showLoading(false); // finally'de var
      console.error('SFTP Delete error:', error);
      alert(`Silme isteği sırasında hata: ${error.message}`);
    } finally {
      showLoading(false);
      await fetchAndDisplayDirectory(currentRemotePath); 
    }
  });
}

// --- Yeni Dosya İşlevi ---
if (sftpNewFileBtn) {
  sftpNewFileBtn.addEventListener('click', async () => {
    if (!sftpConnectionId) {
      alert('SFTP bağlantısı aktif değil.');
      return;
    }
    
    const baseName = 'Yeni Dosya';
    const extension = 'txt';
    const newFileName = await getUniqueName(baseName, extension, 'f');
    console.log('[SFTP Browser] Attempting to create new file with unique name:', newFileName);
    const remoteFilePath = buildItemPath(newFileName);

    showLoading(true);
    let createdSuccessfully = false;
    try {
      console.log(`[SFTP Browser] Calling sftpWriteFile for: ${remoteFilePath}`);
      const result = await window.api.sftpWriteFile(sftpConnectionId, remoteFilePath, ''); // Boş içerik
      console.log('[SFTP Browser] New file (sftpWriteFile) API result:', JSON.stringify(result));
      if (result && result.success) {
        console.log('[SFTP Browser] New file reported as successfully created by API:', newFileName);
        createdSuccessfully = true;
      } else {
        console.error('[SFTP Browser] New file creation failed via API:', result ? result.error : 'Unknown API error');
        alert(`Yeni dosya oluşturulamadı: ${result ? result.error : 'Bilinmeyen bir API hatası oluştu.'}`);
      }
    } catch (error) {
      console.error('[SFTP Browser] SFTP New File sftpWriteFile request error:', error);
      alert(`Yeni dosya oluşturma isteği sırasında (istemci tarafı) hata: ${error.message}`);
    } finally {
      console.log(`[SFTP Browser] In finally for new file. Created successfully: ${createdSuccessfully}. Refreshing dir: ${currentRemotePath}. Item to find: ${newFileName}`);
      await fetchAndDisplayDirectory(currentRemotePath); // Önce listeyi yenile
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFileName); // Sonra yeniden adlandırmayı dene
      }
      showLoading(false); 
    }
  });
}

// --- Yeni Klasör İşlevi ---
if (sftpNewFolderBtn) {
  sftpNewFolderBtn.addEventListener('click', async () => {
    if (!sftpConnectionId) {
      alert('SFTP bağlantısı aktif değil.');
      return;
    }

    const baseName = 'Yeni Klasör';
    const newFolderName = await getUniqueName(baseName, '', 'd');
    console.log('[SFTP Browser] Attempting to create new folder with unique name:', newFolderName);
    const remoteFolderPath = buildItemPath(newFolderName);

    showLoading(true);
    let createdSuccessfully = false;
    try {
      console.log(`[SFTP Browser] Calling sftpMkdir for: ${remoteFolderPath}`);
      const result = await window.api.sftpMkdir(sftpConnectionId, remoteFolderPath);
      console.log('[SFTP Browser] New folder (sftpMkdir) API result:', JSON.stringify(result));
      if (result && result.success) {
        console.log('[SFTP Browser] New folder reported as successfully created by API:', newFolderName);
        createdSuccessfully = true;
      } else {
        console.error('[SFTP Browser] New folder creation failed via API:', result ? result.error : 'Unknown API error');
        alert(`Yeni klasör oluşturulamadı: ${result ? result.error : 'Bilinmeyen bir API hatası oluştu.'}`);
      }
    } catch (error) {
      console.error('[SFTP Browser] SFTP New Folder sftpMkdir request error:', error);
      alert(`Yeni klasör oluşturma isteği sırasında (istemci tarafı) hata: ${error.message}`);
    } finally {
      console.log(`[SFTP Browser] In finally for new folder. Created successfully: ${createdSuccessfully}. Refreshing dir: ${currentRemotePath}. Item to find: ${newFolderName}`);
      await fetchAndDisplayDirectory(currentRemotePath); // Önce listeyi yenile
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFolderName); // Sonra yeniden adlandırmayı dene
      }
      showLoading(false);
    }
  });
}

// Yeni fonksiyon: Öğeyi bulup isim değiştirme modunu aktif eder (Bu fonksiyonu henüz detaylandırmadık)
function findAndEnableRenameMode(itemName) {
  console.log(`[SFTP Browser] Attempting to find and enable rename mode for: ${itemName}`);
  setTimeout(() => {
    const listItems = sftpFileListElement.querySelectorAll('li');
    let found = false;
    for (const listItem of listItems) {
      if (listItem.dataset.name === itemName) {
        found = true;
        console.log('[SFTP Browser] Found item to rename:', itemName, listItem);
        if (selectedSftpItem && selectedSftpItem.element) {
          selectedSftpItem.element.classList.remove('selected');
        }
        listItem.classList.add('selected');
        const itemType = listItem.dataset.type;
        const fullPath = buildItemPath(itemName); // Helper kullanıldı
        selectedSftpItem = { element: listItem, name: itemName, type: itemType, path: fullPath };
        updateSftpActionButtonsState();
        
        // enableRenameMode(listItem, itemName); // Gerçek yeniden adlandırma UI'ı henüz eklenmedi
        console.log('[SFTP Browser] enableRenameMode would be called here for:', itemName);
        break;
      }
    }
    if (!found) {
        console.warn('[SFTP Browser] Item to rename not found in list after refresh:', itemName);
    }
  }, 250); // Gecikmeyi biraz artırdım, DOM güncellemesi için
}

// ... rest of the file, including getUniqueName ...
async function getUniqueName(baseName, extension = '', type = 'f') {
  let name = extension ? `${baseName}.${extension}` : baseName;
  let counter = 1;
  // getUniqueName çağrılmadan hemen önce fetchAndDisplayDirectory yapılmadığı için
  // sftpFileListElement güncel olmayabilir. İdeal olanı sunucudan kontrol etmek veya
  // en azından son fetch edilen listeyi kullanmaktır.
  // Şimdilik DOM'daki listeyi kullanmaya devam ediyor.
  const existingItems = Array.from(sftpFileListElement.querySelectorAll('li[data-name]'))
                             .map(li => li.dataset.name);
  console.log('[SFTP Browser] Existing items for unique name check:', existingItems);

  while (existingItems.includes(name)) {
    counter++;
    name = extension ? `${baseName} (${counter}).${extension}` : `${baseName} (${counter})`;
  }
  console.log('[SFTP Browser] Generated unique name:', name);
  return name;
}

document.addEventListener('DOMContentLoaded', () => {
    updateSftpActionButtonsState();
});

console.log('SFTP Browser script loaded with action buttons and selection logic.'); 