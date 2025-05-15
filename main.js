const { app, BrowserWindow, ipcMain, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const Store = require('electron-store');
const SSHClient = require('./src/common/ssh-client');
const SFTPClient = require('./src/common/sftp-client');
const os = require('os');

// Initialize store for saving app configuration
const store = new Store();

let mainWindow;

// Uzak sunucu istatistikleri için interval'leri saklayacak Map
const activeStatIntervals = new Map();
const STAT_INTERVAL_MS = 3000; // 3 saniyede bir istatistik çek

// RAM bilgisini parse etmek için yardımcı fonksiyon
function parseRamUsage(freeOutput) {
  try {
    const lines = freeOutput.split('\n');
    const memLine = lines.find(line => line.startsWith('Mem:'));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      // parts[0] = 'Mem:', parts[1] = total, parts[2] = used, parts[3] = free
      const totalMem = parseInt(parts[1], 10);
      const usedMem = parseInt(parts[2], 10);
      if (!isNaN(totalMem) && !isNaN(usedMem) && totalMem > 0) {
        const usagePercent = (usedMem / totalMem) * 100;
        return { total: totalMem, used: usedMem, percent: usagePercent };
      }
    }
  } catch (error) {
    console.error('RAM parse error:', error, 'Output:', freeOutput);
  }
  return null;
}

// CPU bilgisini parse etmek için yardımcı fonksiyon (Linux için)
function parseCpuUsage(topOutput) {
  try {
    // Örnek çıktı: '8.3' (sadece idle olmayan yüzde)
    // Veya direkt kullanım yüzdesini alan komut sonrası: '12.7'
    const usage = parseFloat(topOutput.trim());
    if (!isNaN(usage)) {
      return usage;
    }
  } catch (error) {
    console.error('CPU parse error:', error, 'Output:', topOutput);
  }
  return null;
}

// Disk bilgisini parse etmek için yardımcı fonksiyon (Linux için)
function parseDiskUsage(dfOutput) {
  try {
    // Örnek beklenen çıktı: "totalKBlocks_usedKBlocks_Percent"
    // Örneğin: "236610660_23855872_11"
    const parts = dfOutput.trim().split('_');
    if (parts.length === 3) {
      const totalKB = parseInt(parts[0], 10);
      const usedKB = parseInt(parts[1], 10);
      const percent = parseInt(parts[2], 10);
      if (!isNaN(totalKB) && !isNaN(usedKB) && !isNaN(percent)) {
        return {
          totalMB: Math.round(totalKB / 1024),
          usedMB: Math.round(usedKB / 1024),
          percent: percent
        };
      }
    }
  } catch (error) {
    console.error('Disk parse error:', error, 'Output:', dfOutput);
  }
  return null;
}

async function fetchAndSendRemoteStats(connectionId) {
  if (!mainWindow || mainWindow.isDestroyed() || !SSHClient.getConnection(connectionId)) {
    // Eğer pencere yoksa veya bağlantı artık SSHClient listesinde değilse interval'ı durdur
    if (activeStatIntervals.has(connectionId)) {
      clearInterval(activeStatIntervals.get(connectionId));
      activeStatIntervals.delete(connectionId);
      console.log(`[${connectionId}] Stats interval stopped (window/connection closed).`);
    }
    return;
  }

  try {
    // RAM Bilgisi
    const ramCommand = 'free -m';
    const rawRamData = await SSHClient.executeCommand(connectionId, ramCommand);
    const ramUsage = parseRamUsage(rawRamData);

    // CPU Bilgisi (Linux için)
    // Bu komut, idle olmayan (user, system, nice) CPU kullanım yüzdelerinin toplamını verir.
    // Alternatif: const cpuCommand = "top -bn1 | grep '%Cpu(s)' | sed 's/.*,\s*\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'";
    const cpuCommand = "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'"
    // Daha basit bir CPU komutu, /proc/stat okuyarak ve bir önceki değeri saklayarak daha doğru olurdu ama bu daha karmaşık.
    // Şimdilik `top` kullanan bir komut daha basit olabilir veya server'da `vmstat` varsa o da bir seçenek.
    // Örnek `top` komutu: (Bu komut direkt % kullanım verir)
    const simplerCpuCommand = "top -bn1 | awk '/^%Cpu/{print $2+$4+$6}'"; // user + system + nice
    const rawCpuData = await SSHClient.executeCommand(connectionId, simplerCpuCommand);
    const cpuUsage = parseCpuUsage(rawCpuData);

    // Disk Bilgisi (Kök dizin için)
    const diskCommand = "df -P / | tail -n 1 | awk '{print $2 \"_\" $3 \"_\" $5}' | sed 's/%//g'";
    const rawDiskData = await SSHClient.executeCommand(connectionId, diskCommand);
    const diskUsage = parseDiskUsage(rawDiskData);

    if (ramUsage || cpuUsage || diskUsage) {
      // console.log(`[${connectionId}] Remote Stats: CPU ${cpuUsage !== null ? cpuUsage.toFixed(1) + '%' : 'N/A'}, RAM ${ramUsage ? ramUsage.percent.toFixed(1) + '%' : 'N/A'}`);
      mainWindow.webContents.send('remote-system-info-update', {
        connectionId,
        cpu: cpuUsage,     // Yüzde olarak (null olabilir)
        mem: ramUsage ? ramUsage.percent : null, // Yüzde olarak (null olabilir)
        memTotalMB: ramUsage ? ramUsage.total : null,
        memUsedMB: ramUsage ? ramUsage.used : null,
        disk: diskUsage ? diskUsage.percent : null, // Yüzde olarak (null olabilir)
        diskTotalMB: diskUsage ? diskUsage.totalMB : null,
        diskUsedMB: diskUsage ? diskUsage.usedMB : null,
      });
    } else {
        // console.log(`[${connectionId}] Failed to fetch or parse remote stats.`);
    }

  } catch (error) {
    console.error(`[${connectionId}] Error fetching remote stats:`, error.message);
    // Belirli hatalarda interval'ı durdurabiliriz, örneğin bağlantı artık yoksa.
    // SSHClient.executeCommand zaten bağlantı yoksa reject edecektir.
    if (error.message.includes('SSH connection not found')) {
        if (activeStatIntervals.has(connectionId)) {
            clearInterval(activeStatIntervals.get(connectionId));
            activeStatIntervals.delete(connectionId);
            console.log(`[${connectionId}] Stats interval stopped due to connection error.`);
            mainWindow.webContents.send('clear-remote-system-info', { connectionId });
        }
    }
  }
}

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

// SSH bağlantısı kurulduğunda istatistik çekmeyi ve SFTP bağlamayı başlat
ipcMain.handle('connect-ssh', async (event, connectionConfig) => {
  let currentSshConnectionId; // Bu scope'ta tanımlayalım
  try {
    currentSshConnectionId = await SSHClient.connect(
      connectionConfig,
      (data) => { // onData
        if (mainWindow && !mainWindow.isDestroyed() && currentSshConnectionId) {
          mainWindow.webContents.send('ssh-data', currentSshConnectionId, data);
        }
      },
      (error) => { // onError
        if (mainWindow && !mainWindow.isDestroyed() && currentSshConnectionId) {
          mainWindow.webContents.send('ssh-error', currentSshConnectionId, error);
        }
      },
      (closedConnectionId) => { // onClose (shell stream close)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ssh-close', closedConnectionId);
        }
        if (activeStatIntervals.has(closedConnectionId)) {
          clearInterval(activeStatIntervals.get(closedConnectionId));
          activeStatIntervals.delete(closedConnectionId);
          console.log(`[${closedConnectionId}] Stats interval stopped (shell closed).`);
          mainWindow.webContents.send('clear-remote-system-info', { connectionId: closedConnectionId });
        }
        // SFTP'yi de kapatma olayı gönderelim (eğer açıksa)
        // Bu, SFTPClient kendi bağlantılarını yönettiği için daha karmaşık olabilir,
        // Şimdilik sadece ssh ID'sini gönderiyoruz, renderer tarafı kendi sftp ID'sini biliyorsa işlem yapar.
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sftp-close', { sshConnectionId: closedConnectionId, reason: 'ssh_shell_closed' });
        }
      }
    );

    // İstatistik çekme interval'ını başlat
    if (!activeStatIntervals.has(currentSshConnectionId)) {
      fetchAndSendRemoteStats(currentSshConnectionId); 
      const intervalId = setInterval(() => fetchAndSendRemoteStats(currentSshConnectionId), STAT_INTERVAL_MS);
      activeStatIntervals.set(currentSshConnectionId, intervalId);
      console.log(`[${currentSshConnectionId}] Stats interval started.`);
    }

    // SSH bağlantısı başarılı, şimdi SFTP bağlamayı dene
    try {
      console.log(`[${currentSshConnectionId}] Attempting to connect SFTP...`);
      // SFTPClient'ın connect metodu SSHClient'ın config objesine benzer bir config bekler.
      // Gerekirse connectionConfig'i SFTPClient için uyarlayın.
      const sftpConfig = { ...connectionConfig, // host, port, username, password, privateKeyPath, passphrase
        // SFTP'ye özel ek ayarlar buraya gelebilir
      };
      const sftpConnectionId = await SFTPClient.connect(sftpConfig);
      console.log(`[${currentSshConnectionId}] SFTP connected with ID: ${sftpConnectionId}`);
      
      // Başlangıç dizinini al (genellikle kullanıcının ev dizini)
      // SFTPClient.js'de bir `pwd` veya `getHomeDirectory` metodu olmalı ya da eklenebilir.
      // Şimdilik varsayılan olarak '/' veya kullanıcı adından türetilmiş bir yol kullanılabilir.
      // En basit haliyle, SFTPClient.list(sftpConnectionId, '.') ile başlanabilir, bu genellikle ev dizinini verir.
      let initialPath = '/'; // Varsayılan
      try {
        // SFTPClient'in `list` metodu genellikle göreceli yolları da destekler.
        // Home dizinini almak için basit bir yol: '.' listelemek ve ilk gerçek dizini almak ya da doğrudan pwd benzeri bir komut çalıştırmak.
        // SFTPClient'da `pwd()` gibi bir metod yoksa, bunu eklemek daha iyi olur.
        // Şimdilik `.` ile başlıyoruz, SFTP sunucuları genellikle bunu ev dizini olarak yorumlar.
        const homeDirTest = await SFTPClient.list(sftpConnectionId, '.');
        if (homeDirTest && homeDirTest.success) {
            // `list` direkt path dönmüyor, bu yüzden `.` kullanmak ve renderer'da path'i oluşturmak daha mantıklı.
            initialPath = '.'; // Renderer bu '.'yı uygun şekilde yorumlayacak (veya sunucu home dir'e yönlendirecek)
            // Alternatif olarak, SFTPClient'a bir getHomeDir() metodu eklenebilir.
        } else {
            console.warn(`[${sftpConnectionId}] Could not determine initial SFTP path, using '/'.`);
        }
      } catch (pathError) {
        console.warn(`[${sftpConnectionId}] Error determining initial SFTP path, using '/':`, pathError.message);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sftp-ready', { 
          sshConnectionId: currentSshConnectionId, 
          sftpConnectionId: sftpConnectionId,
          initialPath: initialPath 
        });
      }
    } catch (sftpError) {
      console.error(`[${currentSshConnectionId}] SFTP connection failed:`, sftpError.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sftp-failed', { sshConnectionId: currentSshConnectionId, error: sftpError.message });
        // SFTP bağlanamadıysa arayüze `sftp-close` gibi bir event göndererek UI'ı temizletebiliriz.
        mainWindow.webContents.send('sftp-close', { sshConnectionId: currentSshConnectionId, reason: 'sftp_connect_failed' });
      }
    }

    return { success: true, connectionId: currentSshConnectionId };
  } catch (error) {
    // Eğer SSHClient.connect hata fırlatırsa currentSshConnectionId tanımsız olabilir.
    console.error('SSH connection error:', error.message);
    return { success: false, error: error.message };
  }
});

// SSH bağlantısı kesildiğinde istatistik çekmeyi ve SFTP'yi durdur/temizle
ipcMain.handle('disconnect-ssh', (event, sshConnectionId) => {
  try {
    if (activeStatIntervals.has(sshConnectionId)) {
      clearInterval(activeStatIntervals.get(sshConnectionId));
      activeStatIntervals.delete(sshConnectionId);
      console.log(`[${sshConnectionId}] Stats interval stopped (disconnect request).`);
      if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('clear-remote-system-info', { connectionId: sshConnectionId });
      }
    }
    SSHClient.close(sshConnectionId);
    
    // İlgili SFTP bağlantısını da kapat ve arayüzü bilgilendir.
    // Bu, SFTP bağlantılarının SSH ID'leri ile eşlenmesini gerektirir.
    // Şimdilik genel bir sftp-close gönderiyoruz, renderer tarafı ilgilenir.
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log(`[${sshConnectionId}] Sending sftp-close due to SSH disconnect.`);
      mainWindow.webContents.send('sftp-close', { sshConnectionId: sshConnectionId, reason: 'ssh_disconnected' });
    }

    return { success: true };
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

// IPC Handlers for SFTP file operations
ipcMain.handle('sftp-read-file', async (event, { connectionId, remoteFilePath }) => {
  try {
    const content = await SFTPClient.readFile(connectionId, remoteFilePath);
    return { success: true, content };
  } catch (error) {
    console.error(`[${connectionId}] Error reading remote file ${remoteFilePath}:`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sftp-write-file', async (event, { connectionId, remoteFilePath, content }) => {
  try {
    await SFTPClient.writeFile(connectionId, remoteFilePath, content);
    return { success: true };
  } catch (error) {
    console.error(`[${connectionId}] Error writing remote file ${remoteFilePath}:`, error);
    return { success: false, error: error.message };
  }
}); 