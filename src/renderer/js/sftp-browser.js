const fileEditorModal = document.getElementById('fileEditorModal');
const fileEditorTextareaEl = document.getElementById('fileEditorTextarea');
const saveFileButtonEl = document.getElementById('saveFileButton');
const closeFileEditorModalButton = document.getElementById('closeFileEditorModal');
const cancelFileEditButtonEl = document.getElementById('cancelFileEditButton');
const fileEditorTitleEl = document.getElementById('fileEditorTitle');
let editingFilePath = null;
let sftpCurrentSshConnectionId = null;

let sftpConnectionId = null;
let currentRemotePath = '';

const sftpStatusElement = document.getElementById('sftpConnectionStatus');
const sftpUpButton = document.getElementById('sftpUpButton');
const sftpRefreshButton = document.getElementById('sftpRefreshButton');
const sftpCurrentPathElement = document.getElementById('sftpCurrentPath');
const sftpFileListElement = document.getElementById('sftpFileList');
const sftpLoadingIndicator = document.getElementById('sftpLoadingIndicator');

const sftpUploadBtn = document.getElementById('sftpUploadBtn');
const sftpDownloadBtn = document.getElementById('sftpDownloadBtn');
const sftpDeleteBtn = document.getElementById('sftpDeleteBtn');
const sftpNewFileBtn = document.getElementById('sftpNewFileBtn');
const sftpNewFolderBtn = document.getElementById('sftpNewFolderBtn');

/**
 * @type {{element: HTMLLIElement, name: string, type: 'f'|'d', path: string} | null}
 * SFTP dosya listesinde seçili olan öğeyi tutar.
 * `element`: Seçili <li> DOM öğesi.
 * `name`: Öğenin adı.
 * `type`: Öğenin türü ('f' dosya, 'd' dizin).
 * `path`: Öğenin tam uzak yolu.
 */
let selectedSftpItem = null;
/**
 * @type {HTMLElement | null}
 * Aktif olarak gösterilen özel sağ tıklama (bağlam) menüsünün DOM öğesini tutar.
 */
let activeContextMenu = null;

/**
 * Varsa aktif özel bağlam menüsünü DOM'dan kaldırır ve `activeContextMenu` değişkenini sıfırlar.
 */
function closeActiveContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

/**
 * Belgedeki herhangi bir tıklamayı dinler.
 * Tıklama, aktif bir bağlam menüsünün dışındaysa, o menüyü kapatır.
 */
document.addEventListener('click', (event) => {
  if (activeContextMenu && !activeContextMenu.contains(event.target)) {
    closeActiveContextMenu();
  }
});

/**
 * Verilen öğe adı ve mevcut uzak yola göre tam bir uzak yol oluşturur.
 * @param {string} itemName - Dosya veya klasör adı.
 * @returns {string} Oluşturulan tam uzak yol. Eğer `currentRemotePath` tanımsızsa, sadece `itemName` döner.
 */
function buildItemPath(itemName) {
    if (!currentRemotePath) {
        console.warn('[SFTP Browser] buildItemPath called with no currentRemotePath');
        return itemName;
    }
    return (currentRemotePath === '/' ? '/' : currentRemotePath + '/') + itemName;
}

/**
 * SFTP işlemleri sırasında yükleme göstergesini (spinner) gösterir veya gizler.
 * @param {boolean} isLoading - Yükleme göstergesinin gösterilip gösterilmeyeceği. `true` ise gösterir, `false` ise gizler.
 *                              Gösterilirken dosya listesini temizler.
 */
function showLoading(isLoading) {
  if (sftpLoadingIndicator) {
    sftpLoadingIndicator.style.display = isLoading ? 'block' : 'none';
  }
  if (sftpFileListElement && isLoading) {
    sftpFileListElement.innerHTML = '';
  }
}

/**
 * Belirtilen uzak SFTP yolunun içeriğini alır ve dosya listesi öğesinde görüntüler.
 * @async
 * @param {string} pathToList - Listelenecek uzak dizinin yolu.
 * @param {string | null} [nameToFocus=null] - Listeleme sonrası odaklanılacak öğenin adı (isteğe bağlı).
 */
async function fetchAndDisplayDirectory(pathToList, nameToFocus = null) {
  closeActiveContextMenu();
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
    
    if (result && result.success && Array.isArray(result.list)) {
      currentRemotePath = pathToList;
      sftpCurrentPathElement.value = currentRemotePath;
      sftpFileListElement.innerHTML = '';

      const directories = result.list.filter(item => item.type === 'd' || item.type === 'l');
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
        listItem.innerHTML = `<span class="icon">📁</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'd';
        listItem.title = `${item.name} (Klasör)`;
        sftpFileListElement.appendChild(listItem);
      });

      files.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📄</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'f';
        listItem.title = `${item.name} (Dosya)`;
        sftpFileListElement.appendChild(listItem);
      });
    } else {
      sftpFileListElement.innerHTML = `<li>Hata: ${result.error || 'Dosyalar listelenemedi.'}</li>`;
      console.error('[SFTP Browser] SFTP list API error:', result.error);
    }
  } catch (error) {
    sftpFileListElement.innerHTML = `<li>İstek hatası: ${error.message}</li>`;
    console.error('SFTP list request error:', error);
  } finally {
    showLoading(false);
    selectedSftpItem = null;
    updateSftpActionButtonsState();
    if (nameToFocus) {
        findAndSelectItem(nameToFocus);
    }
  }
}

/**
 * SFTP dosya listesindeki bir öğeye çift tıklama olayını yönetir.
 * Klasörse, içeriğini `fetchAndDisplayDirectory` ile yükler.
 * Dosyaysa, içeriğini `sftpReadFile` API'si ile okur ve dosya düzenleyici modalında gösterir.
 * @param {MouseEvent} event - Çift tıklama olayı.
 */
sftpFileListElement.addEventListener('dblclick', async (event) => {
  closeActiveContextMenu();
  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name || !selectedSftpItem || selectedSftpItem.element !== listItem) return;

  const { name: itemName, type: itemType, path: fullPath } = selectedSftpItem;

  if (!sftpCurrentSshConnectionId) {
      console.warn("SFTP operation attempted without a valid SSH connection context for SFTP.");
      alert("SFTP için geçerli bir bağlantı bulunamadı.");
      return;
  }

  if (itemType === 'd') {
    fetchAndDisplayDirectory(fullPath);
  } else if (itemType === 'f') {
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

/**
 * SFTP dosya listesindeki bir öğeye tıklama olayını yönetir.
 * Tıklanan öğeyi seçili olarak işaretler, `selectedSftpItem` değişkenini günceller ve
 * SFTP eylem butonlarının durumunu `updateSftpActionButtonsState` ile günceller.
 * @param {MouseEvent} event - Tıklama olayı.
 */
sftpFileListElement.addEventListener('click', (event) => {
  closeActiveContextMenu();
  const listItem = event.target.closest('li');
  
  if (selectedSftpItem && selectedSftpItem.element) {
    selectedSftpItem.element.classList.remove('selected');
  }
  selectedSftpItem = null;

  if (!listItem || !listItem.dataset.name || listItem.textContent === 'Klasör boş.') {
    updateSftpActionButtonsState();
    return;
  }

  const itemName = listItem.dataset.name;
  const itemType = listItem.dataset.type;
  listItem.classList.add('selected');
  const fullPath = buildItemPath(itemName);
  selectedSftpItem = { element: listItem, name: itemName, type: itemType, path: fullPath };
  updateSftpActionButtonsState();
});

/**
 * SFTP dosya listesindeki bir öğeye sağ tıklama (contextmenu) olayını yönetir.
 * Özel bir bağlam menüsü (Yeniden Adlandır) oluşturur ve gösterir.
 * @param {MouseEvent} event - Sağ tıklama olayı.
 */
sftpFileListElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  closeActiveContextMenu();

  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name || listItem.textContent === 'Klasör boş.') {
    return;
  }

  if (selectedSftpItem && selectedSftpItem.element) {
    selectedSftpItem.element.classList.remove('selected');
  }
  listItem.classList.add('selected');
  const itemName = listItem.dataset.name;
  const itemType = listItem.dataset.type;
  const itemPath = buildItemPath(itemName);
  selectedSftpItem = { element: listItem, name: itemName, type: itemType, path: itemPath };
  updateSftpActionButtonsState();

  activeContextMenu = document.createElement('div');
  activeContextMenu.classList.add('sftp-context-menu');
  activeContextMenu.style.position = 'absolute';
  activeContextMenu.style.left = `${event.pageX}px`;
  activeContextMenu.style.top = `${event.pageY}px`;

  const renameButton = document.createElement('button');
  renameButton.textContent = 'Yeniden Adlandır';
  renameButton.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!selectedSftpItem || !selectedSftpItem.element) return;

    const currentListItem = selectedSftpItem.element;
    const itemNameSpan = currentListItem.querySelector('.sftp-item-name');
    const iconSpan = currentListItem.querySelector('.icon');
    if (!itemNameSpan) return;

    const oldName = selectedSftpItem.name;
    itemNameSpan.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.classList.add('sftp-rename-input');
    
    if (iconSpan) {
        iconSpan.insertAdjacentElement('afterend', input);
    } else {
        currentListItem.insertBefore(input, itemNameSpan);
    }
    input.focus();
    input.select();

    const handleRename = async () => {
      const newName = input.value.trim();
      input.remove();
      itemNameSpan.style.display = '';

      if (newName && newName !== oldName) {
        const oldPath = selectedSftpItem.path;
        const newPath = buildItemPath(newName);
        
        if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
          alert('SFTP bağlantısı veya SSH ID bulunamadı.');
          await fetchAndDisplayDirectory(currentRemotePath);
          return;
        }
        
        console.log(`[SFTP Browser] Renaming from '${oldPath}' to '${newPath}' using SSH ID: ${sftpCurrentSshConnectionId}`);
        showLoading(true);
        try {
          const result = await window.api.sftpRename(sftpConnectionId, oldPath, newPath, sftpCurrentSshConnectionId);
          if (result.success) {
            console.log(`[SFTP Browser] Item renamed successfully to ${newName}`);
          } else {
            console.error('[SFTP Browser] Rename failed:', result.error);
            alert(`Yeniden adlandırma hatası: ${result.error || 'Bilinmeyen hata'}`);
          }
        } catch (error) {
          console.error('[SFTP Browser] Rename request error:', error);
          alert(`Yeniden adlandırma isteği sırasında hata: ${error.message}`);
        } finally {
          await fetchAndDisplayDirectory(currentRemotePath, newName);
        }
      } else {
        await fetchAndDisplayDirectory(currentRemotePath, oldName);
      }
    };

    input.addEventListener('blur', handleRename);
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        input.removeEventListener('blur', handleRename);
        await handleRename();
      } else if (e.key === 'Escape') {
        input.removeEventListener('blur', handleRename);
        input.remove();
        itemNameSpan.style.display = '';
        await fetchAndDisplayDirectory(currentRemotePath, oldName);
      }
    });
  });

  activeContextMenu.appendChild(renameButton);
  document.body.appendChild(activeContextMenu);
});

/**
 * SFTP eylem butonlarının (Yükle, İndir, Sil, Yeni Dosya, Yeni Klasör)
 * etkin/devre dışı durumlarını, mevcut SFTP bağlantı durumuna ve seçili öğeye göre günceller.
 */
function updateSftpActionButtonsState() {
    const hasSftpConnection = !!sftpConnectionId;
    const itemIsSelected = !!selectedSftpItem;
    const itemIsFile = itemIsSelected && selectedSftpItem.type === 'f';

    if (sftpUploadBtn) sftpUploadBtn.disabled = !hasSftpConnection;
    if (sftpNewFileBtn) sftpNewFileBtn.disabled = !hasSftpConnection;
    if (sftpNewFolderBtn) sftpNewFolderBtn.disabled = !hasSftpConnection;

    if (sftpDownloadBtn) sftpDownloadBtn.disabled = !(hasSftpConnection && itemIsFile);
    if (sftpDeleteBtn) sftpDeleteBtn.disabled = !(hasSftpConnection && itemIsSelected);
}

/**
 * "Yukarı Git" butonuna tıklama olayını yönetir.
 * Mevcut uzak yoldan bir üst dizine gider ve içeriğini `fetchAndDisplayDirectory` ile görüntüler.
 */
sftpUpButton.addEventListener('click', () => {
  closeActiveContextMenu();
  if (currentRemotePath === '/' || !currentRemotePath) return;
  let parentPath = currentRemotePath.substring(0, currentRemotePath.lastIndexOf('/'));
  if (parentPath === '') parentPath = '/';
  fetchAndDisplayDirectory(parentPath);
});

/**
 * "Yenile" butonuna tıklama olayını yönetir.
 * Mevcut uzak dizinin içeriğini `fetchAndDisplayDirectory` ile yeniden yükler.
 */
sftpRefreshButton.addEventListener('click', () => {
  closeActiveContextMenu();
  if (!currentRemotePath) return;
  fetchAndDisplayDirectory(currentRemotePath);
});

/**
 * Ana süreçten `sftp-ready` olayı geldiğinde SFTP tarayıcısını başlatır.
 * Bağlantı ID'lerini ayarlar, durumu günceller ve başlangıç dizinini listeler.
 * @param {Object} data - Ana süreçten gelen veri.
 * @param {string} data.sftpConnectionId - SFTP bağlantı ID'si.
 * @param {string} data.sshConnectionId - İlişkili SSH bağlantı ID'si.
 * @param {string} [data.initialPath='/'] - Başlangıçta listelenecek uzak yol.
 */
if (window.api && window.api.onSftpReady) {
  window.api.onSftpReady(async (data) => {
    console.log('SFTP Ready event received:', data);
    if (data.sshConnectionId) {
        sftpCurrentSshConnectionId = data.sshConnectionId;
    } else {
        console.warn("SFTP Ready event received without sshConnectionId. Operations requiring sudo may fail.");
    }
    sftpConnectionId = data.sftpConnectionId;
    sftpStatusElement.textContent = 'SFTP: Bağlandı';
    const initialPath = data.initialPath || '/';
    sftpCurrentPathElement.value = initialPath;
    await fetchAndDisplayDirectory(initialPath);
  });
} else {
    console.warn('window.api.onSftpReady bulunamadı!');
}

/**
 * Ana süreçten `sftp-close` olayı geldiğinde SFTP tarayıcı durumunu sıfırlar.
 * Mevcut oturumla eşleşiyorsa bağlantı bilgilerini temizler, durumu günceller ve dosya listesini boşaltır.
 * @param {Object} data - Ana süreçten gelen veri.
 * @param {string} data.sftpConnectionId - Kapanan SFTP bağlantısının ID'si.
 * @param {string} [data.sshConnectionId] - Kapanan SSH bağlantısının ID'si.
 */
if (window.api && window.api.onSftpClose) {
  window.api.onSftpClose((data) => {
    if (data.sftpConnectionId === sftpConnectionId || (data.sshConnectionId && data.sshConnectionId === sftpCurrentSshConnectionId) ) {
      console.log('SFTP Close event received for current session:', data);
      sftpConnectionId = null;
      sftpCurrentSshConnectionId = null;
      currentRemotePath = '';
      sftpStatusElement.textContent = 'SFTP: Bağlı Değil';
      sftpCurrentPathElement.value = '';
      sftpFileListElement.innerHTML = '';
      closeFileEditor();
      selectedSftpItem = null;
      updateSftpActionButtonsState();
    }
  });
} else {
    console.warn('window.api.onSftpClose bulunamadı!');
}

/**
 * Dosya düzenleyici modalını kapatır ve ilgili değişkenleri sıfırlar.
 */
function closeFileEditor() {
    if (fileEditorModal) {
        fileEditorModal.style.display = 'none';
        if (fileEditorTextareaEl) fileEditorTextareaEl.value = '';
        editingFilePath = null;
        if (fileEditorTitleEl) fileEditorTitleEl.textContent = 'Dosya Düzenle';
    }
}

/**
 * Dosya düzenleyicideki "Kaydet" butonuna tıklama olayını yönetir.
 * Düzenlenen dosyanın içeriğini `sftpWriteFile` API'si ile uzak sunucuya kaydeder.
 */
if (saveFileButtonEl) {
    saveFileButtonEl.addEventListener('click', async () => {
        closeActiveContextMenu();
        if (!editingFilePath || !sftpConnectionId || !sftpCurrentSshConnectionId) {
            alert('Kaydedilecek dosya, SFTP bağlantısı veya SSH ID bulunamadı.');
            return;
        }
        const newContent = fileEditorTextareaEl.value;
        try {
            const result = await window.api.sftpWriteFile(sftpConnectionId, editingFilePath, newContent, sftpCurrentSshConnectionId);
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

/**
 * Dosya düzenleyici modalındaki "Kapat (X)" butonuna tıklama olayını yönetir.
 * `closeFileEditor` fonksiyonunu çağırarak modalı kapatır.
 */
if (closeFileEditorModalButton) {
    closeFileEditorModalButton.addEventListener('click', () => {
        closeFileEditor();
    });
}

/**
 * Dosya düzenleyici modalındaki "İptal" butonuna tıklama olayını yönetir.
 * `closeFileEditor` fonksiyonunu çağırarak modalı kapatır.
 */
if (cancelFileEditButtonEl) {
    cancelFileEditButtonEl.addEventListener('click', () => {
        closeFileEditor();
    });
}

/**
 * "Yükle" butonuna tıklama olayını yönetir.
 * Kullanıcıdan dosya(lar) seçmesini ister ve `sftpUpload` API'si ile uzak sunucuya yükler.
 * Yükleme sonrası dosya listesini yeniler.
 */
if (sftpUploadBtn) {
  sftpUploadBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP bağlantısı veya ilişkili SSH ID aktif değil.');
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
        const fileName = localPath.substring(localPath.replace(/\\/g, '/').lastIndexOf('/') + 1);
        const remotePath = buildItemPath(fileName);
        
        console.log(`SFTP: Uploading ${localPath} to ${remotePath} using SSH ID ${sftpCurrentSshConnectionId}`);
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
      if (allUploadsSuccessful) {
          console.log("[SFTP Browser] All files uploaded successfully (or no files selected).");
      }
    } catch (error) {
      console.error('SFTP Upload error:', error);
      alert(`Dosya seçme veya yükleme sırasında genel bir hata: ${error.message}`);
    } finally {
        showLoading(false);
        await fetchAndDisplayDirectory(currentRemotePath);
    }
  });
}

/**
 * "İndir" butonuna tıklama olayını yönetir.
 * Seçili dosyayı `sftpDownload` API'si ile kullanıcının belirttiği yerel yola indirir.
 */
if (sftpDownloadBtn) {
  sftpDownloadBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
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
      
      if (result.success) {
        alert(`'${defaultFileName}' başarıyla indirildi.`);
      } else {
        console.error('Download failed:', result.error);
        alert(`Dosya indirilemedi: ${result.error}`);
      }
    } catch (error) {
      console.error('SFTP Download error:', error);
      alert(`İndirme sırasında hata: ${error.message}`);
    } finally {
        showLoading(false);
    }
  });
}

/**
 * "Sil" butonuna tıklama olayını yönetir.
 * Seçili dosya veya klasörü, kullanıcı onayı sonrası `sftpDelete` (dosya için) veya
 * `sftpRmdir` (klasör için) API'lerini kullanarak siler. İşlemler `sftpCurrentSshConnectionId` ile yapılır.
 * Silme sonrası dosya listesini yeniler.
 */
if (sftpDeleteBtn) {
  sftpDeleteBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !selectedSftpItem || !sftpCurrentSshConnectionId) {
      alert('Lütfen silmek için bir öğe seçin ve SFTP/SSH bağlantısının aktif olduğundan emin olun.');
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
    
    showLoading(true);
    try {
      let result;
      if (itemType === 'd') { 
        console.log(`SFTP: Deleting directory ${itemPath} using SSH ID: ${sftpCurrentSshConnectionId}`);
        result = await window.api.sftpRmdir(sftpConnectionId, itemPath, true, sftpCurrentSshConnectionId); 
      } else { 
        console.log(`SFTP: Deleting file ${itemPath} using SSH ID: ${sftpCurrentSshConnectionId}`);
        result = await window.api.sftpDelete(sftpConnectionId, itemPath, sftpCurrentSshConnectionId);
      }
      
      if (result.success) {
        console.log(`'${itemName}' başarıyla silindi.`);
      } else {
        console.error('Delete failed:', result.error);
        alert(`Silme hatası: ${result.error}`);
      }
    } catch (error) {
      console.error('SFTP Delete error:', error);
      alert(`Silme isteği sırasında hata: ${error.message}`);
    } finally {
      showLoading(false);
      await fetchAndDisplayDirectory(currentRemotePath); 
    }
  });
}

/**
 * "Yeni Dosya" butonuna tıklama olayını yönetir.
 * `getUniqueName` ile benzersiz bir dosya adı oluşturur, `sftpWriteFile` API'si ile boş bir dosya oluşturur
 * ve `findAndEnableRenameMode` ile yeni dosyayı yeniden adlandırma modunda açar.
 * İşlem `sftpCurrentSshConnectionId` kullanılarak yapılır.
 */
if (sftpNewFileBtn) {
  sftpNewFileBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP bağlantısı veya ilişkili SSH ID aktif değil.');
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
      console.log(`[SFTP Browser] Calling sftpWriteFile for: ${remoteFilePath} with SSH ID: ${sftpCurrentSshConnectionId}`);
      const result = await window.api.sftpWriteFile(sftpConnectionId, remoteFilePath, '', sftpCurrentSshConnectionId);
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
      await fetchAndDisplayDirectory(currentRemotePath);
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFileName);
      }
      showLoading(false); 
    }
  });
}

/**
 * "Yeni Klasör" butonuna tıklama olayını yönetir.
 * `getUniqueName` ile benzersiz bir klasör adı oluşturur, `sftpMkdir` API'si ile yeni bir klasör oluşturur
 * ve `findAndEnableRenameMode` ile yeni klasörü yeniden adlandırma modunda açar.
 * İşlem `sftpCurrentSshConnectionId` kullanılarak yapılır.
 */
if (sftpNewFolderBtn) {
  sftpNewFolderBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP bağlantısı veya ilişkili SSH ID aktif değil.');
      return;
    }

    const baseName = 'Yeni Klasör';
    const newFolderName = await getUniqueName(baseName, '', 'd');
    console.log('[SFTP Browser] Attempting to create new folder with unique name:', newFolderName);
    const remoteFolderPath = buildItemPath(newFolderName);

    showLoading(true);
    let createdSuccessfully = false;
    try {
      console.log(`[SFTP Browser] Calling sftpMkdir for: ${remoteFolderPath} with SSH ID: ${sftpCurrentSshConnectionId}`);
      const result = await window.api.sftpMkdir(sftpConnectionId, remoteFolderPath, sftpCurrentSshConnectionId);
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
      await fetchAndDisplayDirectory(currentRemotePath);
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFolderName);
      }
      showLoading(false);
    }
  });
}

/**
 * Belirtilen ada sahip öğeyi dosya listesinde bulur, seçer ve
 * yeniden adlandırma modunu aktif eder.
 * Kısa bir gecikmeyle çalışır (DOM güncellemelerine zaman tanımak için).
 * @param {string} itemName - Yeniden adlandırma moduna alınacak öğenin adı.
 */
function findAndEnableRenameMode(itemName) {
  console.log(`[SFTP Browser] Attempting to find and enable rename mode for: ${itemName}`);
  setTimeout(() => {
    const listItem = findAndSelectItem(itemName);
    if (listItem && selectedSftpItem && selectedSftpItem.element === listItem) {
        const itemNameSpan = listItem.querySelector('.sftp-item-name');
        const iconSpan = listItem.querySelector('.icon');
        if (!itemNameSpan) return;

        const oldName = selectedSftpItem.name;
        itemNameSpan.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.classList.add('sftp-rename-input');
        
        if (iconSpan) {
            iconSpan.insertAdjacentElement('afterend', input);
        } else {
            listItem.insertBefore(input, itemNameSpan);
        }
        input.focus();
        input.select();

        const handleRename = async () => {
          const newName = input.value.trim();
          input.remove();
          itemNameSpan.style.display = '';
    
          if (newName && newName !== oldName) {
            const oldPath = selectedSftpItem.path;
            const newPath = buildItemPath(newName);
            
            if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
              alert('SFTP bağlantısı veya SSH ID bulunamadı.');
              await fetchAndDisplayDirectory(currentRemotePath);
              return;
            }
            
            console.log(`[SFTP Browser] (findAndEnableRenameMode) Renaming from '${oldPath}' to '${newPath}' using SSH ID: ${sftpCurrentSshConnectionId}`);
            showLoading(true);
            try {
              const result = await window.api.sftpRename(sftpConnectionId, oldPath, newPath, sftpCurrentSshConnectionId);
              if (result.success) {
                console.log(`[SFTP Browser] Item renamed successfully to ${newName} via findAndEnableRenameMode.`);
              } else {
                console.error('[SFTP Browser] Rename failed via findAndEnableRenameMode:', result.error);
                alert(`Yeniden adlandırma hatası: ${result.error || 'Bilinmeyen hata'}`);
              }
            } catch (error) {
              console.error('[SFTP Browser] Rename request error via findAndEnableRenameMode:', error);
              alert(`Yeniden adlandırma isteği sırasında hata: ${error.message}`);
            } finally {
              await fetchAndDisplayDirectory(currentRemotePath, newName);
            }
          } else {
            await fetchAndDisplayDirectory(currentRemotePath, oldName);
          }
        };
    
        input.addEventListener('blur', handleRename);
        input.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            input.removeEventListener('blur', handleRename);
            await handleRename();
          } else if (e.key === 'Escape') {
            input.removeEventListener('blur', handleRename);
            input.remove();
            itemNameSpan.style.display = '';
            await fetchAndDisplayDirectory(currentRemotePath, oldName);
          }
        });
        console.log('[SFTP Browser] Inline rename mode activated for:', itemName);
    } else {
        console.warn('[SFTP Browser] Item to rename not found or selection failed:', itemName);
    }
  }, 300); // DOM güncellemesi ve olası scroll için gecikme biraz artırıldı.
}

/**
 * Belirtilen ada sahip öğeyi SFTP dosya listesinde bulur ve seçili hale getirir.
 * @param {string} itemName - Bulunacak ve seçilecek öğenin adı.
 * @returns {HTMLLIElement | null} Bulunan ve seçilen liste öğesi, bulunamazsa null.
 */
function findAndSelectItem(itemName) {
    const listItems = sftpFileListElement.querySelectorAll('li[data-name]');
    for (const listItem of listItems) {
      if (listItem.dataset.name === itemName) {
        if (selectedSftpItem && selectedSftpItem.element) {
          selectedSftpItem.element.classList.remove('selected');
        }
        listItem.classList.add('selected');
        listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const itemType = listItem.dataset.type;
        const fullPath = buildItemPath(itemName);
        selectedSftpItem = { element: listItem, name: itemName, type: itemType, path: fullPath };
        updateSftpActionButtonsState();
        console.log(`[SFTP Browser] Item found and selected: ${itemName}`);
        return listItem;
      }
    }
    console.warn(`[SFTP Browser] Item not found in list to select: ${itemName}`);
    return null;
}

/**
 * Uzak sunucudaki mevcut öğelerle çakışmayan benzersiz bir dosya/klasör adı oluşturur.
 * Ad çakışması durumunda "(2)", "(3)" gibi ekler yapar.
 * @async
 * @param {string} baseName - Temel dosya/klasör adı (örn: "Yeni Dosya").
 * @param {string} [extension=''] - Dosya uzantısı (örn: "txt"). Klasörler için boş bırakılır.
 * @param {'f'|'d'} [type='f'] - Oluşturulacak öğenin türü ('f' dosya, 'd' dizin). Bu parametre şu anki implementasyonda
 *                               doğrudan kullanılmıyor ancak gelecekteki geliştirmeler için yer tutucudur.
 * @returns {Promise<string>} Benzersiz dosya/klasör adı.
 */
async function getUniqueName(baseName, extension = '', type = 'f') {
  let name = extension ? `${baseName}.${extension}` : baseName;
  let counter = 1;

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

/**
 * DOM tamamen yüklendiğinde SFTP eylem butonlarının başlangıç durumunu ayarlar.
 */
document.addEventListener('DOMContentLoaded', () => {
    updateSftpActionButtonsState();
});

console.log('SFTP Browser script loaded and initialized.'); 
console.log('SFTP Browser script loaded with action buttons and selection logic.'); 

/**
 * SFTP dosya listesine sürükle-bırak ile dosya yükleme desteği ekler.
 * Kullanıcı dosya(lar)ı bu alana bıraktığında, dosyalar mevcut uzak dizine yüklenir.
 */
sftpFileListElement.addEventListener('dragover', (event) => {
  event.preventDefault();
  sftpFileListElement.classList.add('drag-over');
});

sftpFileListElement.addEventListener('dragleave', (event) => {
  event.preventDefault();
  sftpFileListElement.classList.remove('drag-over');
});

sftpFileListElement.addEventListener('drop', async (event) => {
  event.preventDefault();
  sftpFileListElement.classList.remove('drag-over');
  if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
    alert('SFTP bağlantısı veya ilişkili SSH ID aktif değil.');
    return;
  }
  const files = Array.from(event.dataTransfer.files);
  if (!files.length) return;
  showLoading(true);
  let allUploadsSuccessful = true;
  for (const file of files) {
    const localPath = file.path;
    const fileName = file.name;
    const remotePath = buildItemPath(fileName);
    try {
      const result = await window.api.sftpUpload(sftpConnectionId, localPath, remotePath);
      if (!result.success) {
        allUploadsSuccessful = false;
        console.error(`Sürükle-bırak ile yükleme başarısız: ${fileName}: ${result.error}`);
        alert(`'${fileName}' yüklenirken hata: ${result.error}`);
      }
    } catch (error) {
      allUploadsSuccessful = false;
      console.error(`Sürükle-bırak yükleme isteği hatası: ${fileName}:`, error);
      alert(`'${fileName}' yükleme isteği sırasında hata: ${error.message}`);
    }
  }
  if (allUploadsSuccessful) {
    console.log('[SFTP Browser] Sürükle-bırak ile tüm dosyalar başarıyla yüklendi.');
  }
  showLoading(false);
  await fetchAndDisplayDirectory(currentRemotePath);
}); 