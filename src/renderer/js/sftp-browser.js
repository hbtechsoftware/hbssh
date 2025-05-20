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
 * Holds the currently selected item in the SFTP file list.
 * `element`: The selected <li> DOM element.
 * `name`: The name of the item.
 * `type`: The type of the item ('f' for file, 'd' for directory).
 * `path`: The full remote path of the item.
 */
let selectedSftpItem = null;
/**
 * @type {HTMLElement | null}
 * Holds the DOM element of the currently active custom right-click (context) menu.
 */
let activeContextMenu = null;

/**
 * Removes the active custom context menu from the DOM if it exists and resets the `activeContextMenu` variable.
 */
function closeActiveContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

/**
 * Listens for any click on the document.
 * If the click is outside an active context menu, it closes that menu.
 */
document.addEventListener('click', (event) => {
  if (activeContextMenu && !activeContextMenu.contains(event.target)) {
    closeActiveContextMenu();
  }
});

/**
 * Builds a full remote path based on the given item name and the current remote path.
 * @param {string} itemName - The file or folder name.
 * @returns {string} The constructed full remote path. If `currentRemotePath` is undefined, returns just `itemName`.
 */
function buildItemPath(itemName) {
    if (!currentRemotePath) {
        console.warn('[SFTP Browser] buildItemPath called with no currentRemotePath');
        return itemName;
    }
    return (currentRemotePath === '/' ? '/' : currentRemotePath + '/') + itemName;
}

/**
 * Shows or hides the loading indicator (spinner) during SFTP operations.
 * @param {boolean} isLoading - Whether to show the loading indicator. `true` shows it, `false` hides it.
 *                              Clears the file list when shown.
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
 * Fetches the content of the specified remote SFTP path and displays it in the file list element.
 * @async
 * @param {string} pathToList - The path of the remote directory to list.
 * @param {string | null} [nameToFocus=null] - The name of the item to focus on after listing (optional).
 */
async function fetchAndDisplayDirectory(pathToList, nameToFocus = null) {
  closeActiveContextMenu();
  if (!sftpConnectionId) {
    sftpStatusElement.textContent = 'SFTP: Not Connected';
    sftpFileListElement.innerHTML = '<li>No SFTP connection.</li>';
    selectedSftpItem = null;
    updateSftpActionButtonsState();
    return;
  }

  showLoading(true);
  try {
    const result = await window.api.sftpList(sftpConnectionId, pathToList);
    
    if (result && result.success && Array.isArray(result.list)) {
      currentRemotePath = pathToList;
      sftpCurrentPathElement.value = currentRemotePath;
      sftpFileListElement.innerHTML = '';

      const directories = result.list.filter(item => item.type === 'd' || item.type === 'l');
      const files = result.list.filter(item => item.type === '-' || (item.type === 'l' && !directories.includes(item)));

      directories.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      if (directories.length === 0 && files.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.textContent = 'Folder is empty.';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.cursor = 'default';
        sftpFileListElement.appendChild(emptyMessage);
      }

      directories.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📁</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'd';
        listItem.title = `${item.name} (Folder)`;
        sftpFileListElement.appendChild(listItem);
      });

      files.forEach(item => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="icon">📄</span><span class="sftp-item-name">${item.name}</span>`;
        listItem.dataset.name = item.name;
        listItem.dataset.type = 'f';
        listItem.title = `${item.name} (File)`;
        sftpFileListElement.appendChild(listItem);
      });
    } else {
      sftpFileListElement.innerHTML = `<li>Error: ${result.error || 'Could not list files.'}</li>`;
      console.error('[SFTP Browser] SFTP list API error:', result.error);
    }
  } catch (error) {
    sftpFileListElement.innerHTML = `<li>Request error: ${error.message}</li>`;
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
 * Handles the double-click event on an item in the SFTP file list.
 * If it's a folder, loads its content with `fetchAndDisplayDirectory`.
 * If it's a file, reads its content with the `sftpReadFile` API and shows it in the file editor modal.
 * @param {MouseEvent} event - The double-click event.
 */
sftpFileListElement.addEventListener('dblclick', async (event) => {
  closeActiveContextMenu();
  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name || !selectedSftpItem || selectedSftpItem.element !== listItem) return;

  const { name: itemName, type: itemType, path: fullPath } = selectedSftpItem;

  if (!sftpCurrentSshConnectionId) {
      console.warn("SFTP operation attempted without a valid SSH connection context for SFTP.");
      alert("No valid connection found for SFTP.");
      return;
  }

  if (itemType === 'd') {
    fetchAndDisplayDirectory(fullPath);
  } else if (itemType === 'f') {
    if (!sftpConnectionId) {
        alert('SFTP not connected!');
        return;
    }
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
            alert(`Could not read file: ${result.error}`);
        }
    } catch (error) {
        showLoading(false);
        console.error('Failed to request sftpReadFile:', error);
        alert(`File read request failed: ${error.message}`);
    }
  }
});

/**
 * Handles the click event on an item in the SFTP file list.
 * Marks the clicked item as selected, updates the `selectedSftpItem` variable, and
 * updates the state of SFTP action buttons with `updateSftpActionButtonsState`.
 * @param {MouseEvent} event - The click event.
 */
sftpFileListElement.addEventListener('click', (event) => {
  closeActiveContextMenu();
  const listItem = event.target.closest('li');
  
  if (selectedSftpItem && selectedSftpItem.element) {
    selectedSftpItem.element.classList.remove('selected');
  }
  selectedSftpItem = null;

  if (!listItem || !listItem.dataset.name || listItem.textContent === 'Folder is empty.') {
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
 * Handles the right-click (contextmenu) event on an item in the SFTP file list.
 * Creates and displays a custom context menu (Rename).
 * @param {MouseEvent} event - The right-click event.
 */
sftpFileListElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  closeActiveContextMenu();

  const listItem = event.target.closest('li');
  if (!listItem || !listItem.dataset.name || listItem.textContent === 'Folder is empty.') {
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
  renameButton.textContent = 'Rename';
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
          alert('SFTP connection or SSH ID not found.');
          await fetchAndDisplayDirectory(currentRemotePath);
          return;
        }
        
        showLoading(true);
        try {
          const result = await window.api.sftpRename(sftpConnectionId, oldPath, newPath, sftpCurrentSshConnectionId);
          if (result.success) {
            // Item renamed successfully
          } else {
            console.error('[SFTP Browser] Rename failed:', result.error);
            alert(`Rename error: ${result.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('[SFTP Browser] Rename request error:', error);
          alert(`Error during rename request: ${error.message}`);
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
 * Updates the enabled/disabled state of SFTP action buttons (Upload, Download, Delete, New File, New Folder)
 * based on the current SFTP connection status and selected item.
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
 * Handles the click event for the "Up" button.
 * Navigates to the parent directory from the current remote path and displays its content with `fetchAndDisplayDirectory`.
 */
sftpUpButton.addEventListener('click', () => {
  closeActiveContextMenu();
  if (currentRemotePath === '/' || !currentRemotePath) return;
  let parentPath = currentRemotePath.substring(0, currentRemotePath.lastIndexOf('/'));
  if (parentPath === '') parentPath = '/';
  fetchAndDisplayDirectory(parentPath);
});

/**
 * Handles the click event for the "Refresh" button.
 * Reloads the content of the current remote directory with `fetchAndDisplayDirectory`.
 */
sftpRefreshButton.addEventListener('click', () => {
  closeActiveContextMenu();
  if (!currentRemotePath) return;
  fetchAndDisplayDirectory(currentRemotePath);
});

/**
 * Initializes the SFTP browser when the `sftp-ready` event is received from the main process.
 * Sets connection IDs, updates status, and lists the initial directory.
 * @param {Object} data - Data from the main process.
 * @param {string} data.sftpConnectionId - The SFTP connection ID.
 * @param {string} data.sshConnectionId - The associated SSH connection ID.
 * @param {string} [data.initialPath='/'] - The initial remote path to list.
 */
if (window.api && window.api.onSftpReady) {
  window.api.onSftpReady(async (data) => {
    if (data.sshConnectionId) {
        sftpCurrentSshConnectionId = data.sshConnectionId;
    } else {
        console.warn("SFTP Ready event received without sshConnectionId. Operations requiring sudo may fail.");
    }
    sftpConnectionId = data.sftpConnectionId;
    sftpStatusElement.textContent = 'SFTP: Connected';
    const initialPath = data.initialPath || '/';
    sftpCurrentPathElement.value = initialPath;
    await fetchAndDisplayDirectory(initialPath);
  });
} else {
    console.warn('window.api.onSftpReady not found!');
}

/**
 * Resets the SFTP browser state when the `sftp-close` event is received from the main process.
 * Clears connection info, updates status, and empties the file list if it matches the current session.
 * @param {Object} data - Data from the main process.
 * @param {string} data.sftpConnectionId - The ID of the closed SFTP connection.
 * @param {string} [data.sshConnectionId] - The ID of the closed SSH connection.
 */
if (window.api && window.api.onSftpClose) {
  window.api.onSftpClose((data) => {
    if (data.sftpConnectionId === sftpConnectionId || (data.sshConnectionId && data.sshConnectionId === sftpCurrentSshConnectionId) ) {
      sftpConnectionId = null;
      sftpCurrentSshConnectionId = null;
      currentRemotePath = '';
      sftpStatusElement.textContent = 'SFTP: Not Connected';
      sftpCurrentPathElement.value = '';
      sftpFileListElement.innerHTML = '';
      closeFileEditor();
      selectedSftpItem = null;
      updateSftpActionButtonsState();
    }
  });
} else {
    console.warn('window.api.onSftpClose not found!');
}

/**
 * Closes the file editor modal and resets related variables.
 */
function closeFileEditor() {
    if (fileEditorModal) {
        fileEditorModal.style.display = 'none';
        if (fileEditorTextareaEl) fileEditorTextareaEl.value = '';
        editingFilePath = null;
        if (fileEditorTitleEl) fileEditorTitleEl.textContent = 'Edit File';
    }
}

/**
 * Handles the click event for the "Save" button in the file editor.
 * Saves the content of the edited file to the remote server using the `sftpWriteFile` API.
 */
if (saveFileButtonEl) {
    saveFileButtonEl.addEventListener('click', async () => {
        closeActiveContextMenu();
        if (!editingFilePath || !sftpConnectionId || !sftpCurrentSshConnectionId) {
            alert('File to save, SFTP connection, or SSH ID not found.');
            return;
        }
        const newContent = fileEditorTextareaEl.value;
        try {
            const result = await window.api.sftpWriteFile(sftpConnectionId, editingFilePath, newContent, sftpCurrentSshConnectionId);
            if (result.success) {
                alert('File saved successfully!');
                closeFileEditor();
            } else {
                console.error('Error writing file:', result.error);
                alert(`Could not save file: ${result.error}`);
            }
        } catch (error) {
            console.error('Failed to request sftpWriteFile:', error);
            alert(`File save request failed: ${error.message}`);
        }
    });
}

/**
 * Handles the click event for the "Close (X)" button in the file editor modal.
 * Calls the `closeFileEditor` function to close the modal.
 */
if (closeFileEditorModalButton) {
    closeFileEditorModalButton.addEventListener('click', () => {
        closeFileEditor();
    });
}

/**
 * Handles the click event for the "Cancel" button in the file editor modal.
 * Calls the `closeFileEditor` function to close the modal.
 */
if (cancelFileEditButtonEl) {
    cancelFileEditButtonEl.addEventListener('click', () => {
        closeFileEditor();
    });
}

/**
 * Handles the click event for the "Upload" button.
 * Prompts the user to select file(s) and uploads them to the remote server using the `sftpUpload` API.
 * Refreshes the file list after upload.
 */
if (sftpUploadBtn) {
  sftpUploadBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP connection or associated SSH ID is not active.');
      return;
    }
    try {
      const { canceled, filePaths } = await window.api.openFileDialog({
        title: 'Select Files to Upload',
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
        
        try {
          const result = await window.api.sftpUpload(sftpConnectionId, localPath, remotePath);
          if (!result.success) {
            allUploadsSuccessful = false;
            console.error(`Upload failed for ${fileName}: ${result.error}`);
            alert(`Error uploading '${fileName}': ${result.error}`);
          }
        } catch (uploadError) {
          allUploadsSuccessful = false;
          console.error(`Upload request error for ${fileName}:`, uploadError);
          alert(`Error during upload request for '${fileName}': ${uploadError.message}`);
        }
      }
      if (allUploadsSuccessful) {
        // All files uploaded successfully (or no files selected)
      }
    } catch (error) {
      console.error('SFTP Upload error:', error);
      alert(`General error during file selection or upload: ${error.message}`);
    } finally {
        showLoading(false);
        await fetchAndDisplayDirectory(currentRemotePath);
    }
  });
}

/**
 * Handles the click event for the "Download" button.
 * Downloads the selected file to a local path specified by the user using the `sftpDownload` API.
 */
if (sftpDownloadBtn) {
  sftpDownloadBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !selectedSftpItem || selectedSftpItem.type !== 'f') {
      alert('Please select a file to download.');
      return;
    }
    try {
      const remoteFilePath = selectedSftpItem.path;
      const defaultFileName = selectedSftpItem.name;

      const { canceled, filePath: localPath } = await window.api.saveFileDialog({
        title: 'Save File As',
        defaultPath: defaultFileName
      });

      if (canceled || !localPath) {
        return;
      }
      
      showLoading(true);
      const result = await window.api.sftpDownload(sftpConnectionId, remoteFilePath, localPath);
      
      if (result.success) {
        alert(`'${defaultFileName}' downloaded successfully.`);
      } else {
        console.error('Download failed:', result.error);
        alert(`Could not download file: ${result.error}`);
      }
    } catch (error) {
      console.error('SFTP Download error:', error);
      alert(`Error during download: ${error.message}`);
    } finally {
        showLoading(false);
    }
  });
}

/**
 * Handles the click event for the "Delete" button.
 * Deletes the selected file or folder after user confirmation, using `sftpDelete` (for files) or
 * `sftpRmdir` (for folders) APIs. Operations are performed using `sftpCurrentSshConnectionId`.
 * Refreshes the file list after deletion.
 */
if (sftpDeleteBtn) {
  sftpDeleteBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !selectedSftpItem || !sftpCurrentSshConnectionId) {
      alert('Please select an item to delete and ensure SFTP/SSH connection is active.');
      return;
    }

    const itemPath = selectedSftpItem.path;
    const itemName = selectedSftpItem.name;
    const itemType = selectedSftpItem.type;
    const typeText = itemType === 'd' ? 'folder' : 'file';

    const confirm = await window.api.showConfirmDialog({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete the ${typeText} '${itemName}'? This action cannot be undone.`,
      buttons: ['Delete', 'Cancel'],
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
        result = await window.api.sftpRmdir(sftpConnectionId, itemPath, true, sftpCurrentSshConnectionId); 
      } else { 
        result = await window.api.sftpDelete(sftpConnectionId, itemPath, sftpCurrentSshConnectionId);
      }
      
      if (result.success) {
        // Item deleted successfully
      } else {
        console.error('Delete failed:', result.error);
        alert(`Delete error: ${result.error}`);
      }
    } catch (error) {
      console.error('SFTP Delete error:', error);
      alert(`Error during delete request: ${error.message}`);
    } finally {
      showLoading(false);
      await fetchAndDisplayDirectory(currentRemotePath); 
    }
  });
}

/**
 * Handles the click event for the "New File" button.
 * Creates a unique file name with `getUniqueName`, creates an empty file with the `sftpWriteFile` API,
 * and opens the new file in rename mode with `findAndEnableRenameMode`.
 * The operation is performed using `sftpCurrentSshConnectionId`.
 */
if (sftpNewFileBtn) {
  sftpNewFileBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP connection or associated SSH ID is not active.');
      return;
    }
    
    const baseName = 'New File';
    const extension = 'txt';
    const newFileName = await getUniqueName(baseName, extension, 'f');
    const remoteFilePath = buildItemPath(newFileName);

    showLoading(true);
    let createdSuccessfully = false;
    try {
      const result = await window.api.sftpWriteFile(sftpConnectionId, remoteFilePath, '', sftpCurrentSshConnectionId);
      if (result && result.success) {
        createdSuccessfully = true;
      } else {
        console.error('[SFTP Browser] New file creation failed via API:', result ? result.error : 'Unknown API error');
        alert(`Could not create new file: ${result ? result.error : 'An unknown API error occurred.'}`);
      }
    } catch (error) {
      console.error('[SFTP Browser] SFTP New File sftpWriteFile request error:', error);
      alert(`Error during new file creation request (client-side): ${error.message}`);
    } finally {
      await fetchAndDisplayDirectory(currentRemotePath);
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFileName);
      }
      showLoading(false); 
    }
  });
}

/**
 * Handles the click event for the "New Folder" button.
 * Creates a unique folder name with `getUniqueName`, creates a new folder with the `sftpMkdir` API,
 * and opens the new folder in rename mode with `findAndEnableRenameMode`.
 * The operation is performed using `sftpCurrentSshConnectionId`.
 */
if (sftpNewFolderBtn) {
  sftpNewFolderBtn.addEventListener('click', async () => {
    closeActiveContextMenu();
    if (!sftpConnectionId || !sftpCurrentSshConnectionId) {
      alert('SFTP connection or associated SSH ID is not active.');
      return;
    }

    const baseName = 'New Folder';
    const newFolderName = await getUniqueName(baseName, '', 'd');
    const remoteFolderPath = buildItemPath(newFolderName);

    showLoading(true);
    let createdSuccessfully = false;
    try {
      const result = await window.api.sftpMkdir(sftpConnectionId, remoteFolderPath, sftpCurrentSshConnectionId);
      if (result && result.success) {
        createdSuccessfully = true;
      } else {
        console.error('[SFTP Browser] New folder creation failed via API:', result ? result.error : 'Unknown API error');
        alert(`Could not create new folder: ${result ? result.error : 'An unknown API error occurred.'}`);
      }
    } catch (error) {
      console.error('[SFTP Browser] SFTP New Folder sftpMkdir request error:', error);
      alert(`Error during new folder creation request (client-side): ${error.message}`);
    } finally {
      await fetchAndDisplayDirectory(currentRemotePath);
      if (createdSuccessfully) {
        findAndEnableRenameMode(newFolderName);
      }
      showLoading(false);
    }
  });
}

/**
 * Finds the item with the specified name in the file list, selects it, and
 * activates rename mode.
 * Works with a short delay (to allow time for DOM updates).
 * @param {string} itemName - The name of the item to put into rename mode.
 */
function findAndEnableRenameMode(itemName) {
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
              alert('SFTP connection or SSH ID not found.');
              await fetchAndDisplayDirectory(currentRemotePath);
              return;
            }
            
            showLoading(true);
            try {
              const result = await window.api.sftpRename(sftpConnectionId, oldPath, newPath, sftpCurrentSshConnectionId);
              if (result.success) {
                // Item renamed successfully
              } else {
                console.error('[SFTP Browser] Rename failed via findAndEnableRenameMode:', result.error);
                alert(`Rename error: ${result.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.error('[SFTP Browser] Rename request error via findAndEnableRenameMode:', error);
              alert(`Error during rename request: ${error.message}`);
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
    } else {
        console.warn('[SFTP Browser] Item to rename not found or selection failed:', itemName);
    }
  }, 300); // Delay slightly increased for DOM update and potential scroll.
}

/**
 * Finds and selects the item with the specified name in the SFTP file list.
 * @param {string} itemName - The name of the item to find and select.
 * @returns {HTMLLIElement | null} The found and selected list item, or null if not found.
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
        return listItem;
      }
    }
    console.warn(`[SFTP Browser] Item not found in list to select: ${itemName}`);
    return null;
}

/**
 * Creates a unique file/folder name that does not conflict with existing items on the remote server.
 * Appends "(2)", "(3)", etc., in case of name conflicts.
 * @async
 * @param {string} baseName - The base file/folder name (e.g., "New File").
 * @param {string} [extension=''] - The file extension (e.g., "txt"). Left empty for folders.
 * @param {'f'|'d'} [type='f'] - The type of item to create ('f' file, 'd' directory). This parameter is not directly
 *                               used in the current implementation but is a placeholder for future enhancements.
 * @returns {Promise<string>} A unique file/folder name.
 */
async function getUniqueName(baseName, extension = '', type = 'f') {
  let name = extension ? `${baseName}.${extension}` : baseName;
  let counter = 1;

  const existingItems = Array.from(sftpFileListElement.querySelectorAll('li[data-name]'))
                             .map(li => li.dataset.name);

  while (existingItems.includes(name)) {
    counter++;
    name = extension ? `${baseName} (${counter}).${extension}` : `${baseName} (${counter})`;
  }
  return name;
}

/**
 * Sets the initial state of SFTP action buttons when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    updateSftpActionButtonsState();
});


/**
 * Adds drag-and-drop file upload support to the SFTP file list.
 * When the user drops file(s) onto this area, the files are uploaded to the current remote directory.
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
    alert('SFTP connection or associated SSH ID is not active.');
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
        console.error(`Drag-and-drop upload failed: ${fileName}: ${result.error}`);
        alert(`Error uploading '${fileName}': ${result.error}`);
      }
    } catch (error) {
      allUploadsSuccessful = false;
      console.error(`Drag-and-drop upload request error: ${fileName}:`, error);
      alert(`Error during upload request for '${fileName}': ${error.message}`);
    }
  }
  if (allUploadsSuccessful) {
    // All files uploaded successfully via drag-and-drop.
  }
  showLoading(false);
  await fetchAndDisplayDirectory(currentRemotePath);
}); 