const { app, BrowserWindow, ipcMain, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const Store = require('electron-store');
const SSHClient = require('./src/common/ssh-client');
const SFTPClient = require('./src/common/sftp-client');
const os = require('os');

// Initialize store for saving app configuration
const store = new Store();

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'src/preload/preload.js')
    },
    icon: path.join(__dirname, 'resources/icon.png')
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // Open DevTools in development mode
  if (process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+N',
          click() {
            mainWindow.webContents.send('menu-new-connection');
          }
        },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click() {
            mainWindow.webContents.send('menu-new-tab');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          role: 'quit'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About HBSSH',
          click() {
            mainWindow.webContents.send('menu-about');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  // Close all SSH connections before quitting
  SSHClient.closeAll();
  // Close all SFTP connections before quitting
  SFTPClient.closeAll();
  
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for connection management
ipcMain.handle('get-saved-connections', () => {
  return store.get('connections') || [];
});

ipcMain.handle('save-connection', (event, connection) => {
  const connections = store.get('connections') || [];
  
  // Check if this connection already exists
  const existingIndex = connections.findIndex(conn => conn.id === connection.id);
  
  if (existingIndex >= 0) {
    connections[existingIndex] = connection;
  } else {
    connections.push({
      ...connection,
      id: Date.now().toString()
    });
  }
  
  store.set('connections', connections);
  return connections;
});

ipcMain.handle('delete-connection', (event, connectionId) => {
  const connections = store.get('connections') || [];
  const updatedConnections = connections.filter(conn => conn.id !== connectionId);
  store.set('connections', updatedConnections);
  return updatedConnections;
});

// IPC Handlers for SSH operations
ipcMain.handle('connect-ssh', async (event, connection) => {
  try {
    // Connect to the SSH server
    const connectionId = await SSHClient.connect(
      connection,
      (data) => {
        // Send SSH data to the renderer process
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ssh-data', connectionId, data);
        }
      },
      (error) => {
        // Send SSH error to the renderer process
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ssh-error', connectionId, error);
        }
      },
      () => {
        // Send SSH close event to the renderer process
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ssh-close', connectionId);
        }
      }
    );
    
    return { success: true, connectionId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-ssh', (event, connectionId, data) => {
  try {
    SSHClient.write(connectionId, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resize-ssh', (event, connectionId, cols, rows) => {
  try {
    SSHClient.resize(connectionId, cols, rows);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect-ssh', (event, connectionId) => {
  try {
    SSHClient.close(connectionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers for file dialogs
ipcMain.handle('open-file-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true };
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('save-file-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true };
  return await dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('get-home-path', () => {
  return os.homedir();
});

// IPC Handlers for message dialogs
ipcMain.handle('show-message', async (event, options) => {
  if (!mainWindow) return;
  return await dialog.showMessageBox(mainWindow, {
    type: options.type || 'info',
    title: options.title || 'Message',
    message: options.message || '',
    detail: options.detail,
    buttons: options.buttons || ['OK'],
    defaultId: options.defaultId || 0,
    cancelId: options.cancelId,
    noLink: options.noLink || false
  });
});

ipcMain.handle('show-confirm-dialog', async (event, options) => {
  if (!mainWindow) return { response: 1 }; // Default to cancel
  return await dialog.showMessageBox(mainWindow, {
    type: options.type || 'question',
    title: options.title || 'Confirm',
    message: options.message || 'Are you sure?',
    detail: options.detail,
    buttons: options.buttons || ['OK', 'Cancel'],
    defaultId: options.defaultId || 0,
    cancelId: options.cancelId || 1,
    noLink: options.noLink || false
  });
});

// IPC Handlers for clipboard operations
ipcMain.handle('read-clipboard', () => {
  return clipboard.readText();
});

ipcMain.handle('write-clipboard', (event, text) => {
  clipboard.writeText(text);
  return true;
});

// IPC Handlers for SFTP operations
ipcMain.handle('connect-sftp', async (event, connection) => {
  try {
    // Connect to the SFTP server
    const connectionId = await SFTPClient.connect(connection);
    return { success: true, connectionId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect-sftp', async (event, connectionId) => {
  try {
    await SFTPClient.disconnect(connectionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-list', async (event, connectionId, remotePath) => {
  try {
    const list = await SFTPClient.list(connectionId, remotePath);
    return { success: true, list };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-mkdir', async (event, connectionId, remotePath) => {
  try {
    await SFTPClient.mkdir(connectionId, remotePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-delete', async (event, connectionId, remotePath) => {
  try {
    await SFTPClient.delete(connectionId, remotePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-rmdir', async (event, connectionId, remotePath, recursive) => {
  try {
    await SFTPClient.rmdir(connectionId, remotePath, recursive);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-rename', async (event, connectionId, fromPath, toPath) => {
  try {
    await SFTPClient.rename(connectionId, fromPath, toPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-download', async (event, connectionId, remotePath, localPath) => {
  try {
    const transferId = await SFTPClient.download(connectionId, remotePath, localPath);
    return { success: true, transferId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-upload', async (event, connectionId, localPath, remotePath) => {
  try {
    const transferId = await SFTPClient.upload(connectionId, localPath, remotePath);
    return { success: true, transferId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-get-transfer-status', (event, transferId) => {
  const status = SFTPClient.getTransferStatus(transferId);
  return { success: true, status };
});

ipcMain.handle('sftp-cancel-transfer', (event, transferId) => {
  const cancelled = SFTPClient.cancelTransfer(transferId);
  return { success: cancelled };
});

ipcMain.handle('sftp-get-current-directory', (event, connectionId) => {
  try {
    const dir = SFTPClient.getCurrentDirectory(connectionId);
    return { success: true, dir };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-set-current-directory', (event, connectionId, remotePath) => {
  try {
    SFTPClient.setCurrentDirectory(connectionId, remotePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-stat', async (event, connectionId, remotePath) => {
  try {
    const stats = await SFTPClient.stat(connectionId, remotePath);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
}); 