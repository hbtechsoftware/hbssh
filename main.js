const { app, BrowserWindow, ipcMain, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const Store = require('electron-store');
const SSHClient = require('./src/common/ssh-client');
const SFTPClient = require('./src/common/sftp-client');
const os = require('os');
const { spawn } = require('child_process');
const pty = require('node-pty');

const store = new Store();

let mainWindow;

const activeStatIntervals = new Map();
const connectionOsTypes = new Map(); // Stores OS type for each connectionId
const STAT_INTERVAL_MS = 3000;

// Local terminal management
const localTerminals = new Map(); // Stores local terminal processes

/**
 * Parses RAM usage from the output of the Linux 'free -m' command.
 * @param {string} freeOutput - The output string from the 'free -m' command.
 * @returns {{total: number, used: number, percent: number}|null} An object with total RAM, used RAM (both in MB), and usage percentage, or null if parsing fails.
 */
function parseLinuxRamUsage(freeOutput) {
  try {
    const lines = freeOutput.split('\n');
    const memLine = lines.find(line => line.startsWith('Mem:'));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      const totalMem = parseInt(parts[1], 10);
      const usedMem = parseInt(parts[2], 10);
      if (!isNaN(totalMem) && !isNaN(usedMem) && totalMem > 0) {
        const usagePercent = (usedMem / totalMem) * 100;
        return { total: totalMem, used: usedMem, percent: usagePercent };
      }
    }
  } catch (error) {
    console.error('Linux RAM parse error (free -m):', error, 'Output:', freeOutput);
  }
  return null;
}

/**
 * Parses RAM usage from macOS 'top -l 1' command output.
 * @param {string} rawData - Output from `top -l 1 -s 0 | grep PhysMem`.
 * @returns {{total: number, used: number, percent: number}|null} RAM stats in MB.
 */
function parseMacOsTopRam(rawData) {
  try {
    const match = rawData.match(/PhysMem:\s*([\d.]+)([GM])\s*used.*,\s*([\d.]+)([GM])\s*unused/);
    if (match) {
      let usedMem = parseFloat(match[1]);
      const usedUnit = match[2];
      let unusedMem = parseFloat(match[3]);
      const unusedUnit = match[4];

      if (usedUnit === 'G') usedMem *= 1024;
      if (unusedUnit === 'G') unusedMem *= 1024;

      const totalMem = usedMem + unusedMem;
      if (totalMem > 0) {
        const percent = (usedMem / totalMem) * 100;
        return { total: Math.round(totalMem), used: Math.round(usedMem), percent: percent };
      }
    }
  } catch (error) {
    console.error('macOS RAM parse error (top):', error, 'Output:', rawData);
  }
  return null;
}

/**
 * Parses RAM usage from a string formatted as "totalKB_usedKB_percent".
 * @param {string} rawData - The input string.
 * @returns {{total: number, used: number, percent: number}|null} RAM stats with total/used in MB.
 */
function parseKbTotalUsedPercentRam(rawData) {
  try {
    const parts = rawData.trim().split('_');
    if (parts.length === 3) {
      const totalKB = parseInt(parts[0], 10);
      const usedKB = parseInt(parts[1], 10);
      const percent = parseInt(parts[2], 10);
      if (!isNaN(totalKB) && !isNaN(usedKB) && !isNaN(percent) && totalKB >= 0 && usedKB >= 0 && percent >= 0) {
        return {
          total: Math.round(totalKB / 1024),
          used: Math.round(usedKB / 1024),
          percent: percent
        };
      }
    }
  } catch (error) {
    console.error('Formatted RAM (totalKB_usedKB_percent) parse error:', error, 'Output:', rawData);
  }
  return null;
}

/**
 * Parses CPU usage percentage from command output that provides a single float number.
 * @param {string} topOutput - The command output string representing CPU usage.
 * @returns {number|null} CPU usage percentage, or null if parsing fails.
 */
function parseCpuUsage(loadavgOutput) {
  try {
    const parts = loadavgOutput.trim().split(' ');
    if (parts.length >= 1) {
      const load1min = parseFloat(parts[0]);
      if (!isNaN(load1min)) {
        const approxCpuPercent = Math.min(load1min * 100, 100);
        return Math.round(approxCpuPercent * 10) / 10;
      }
    }
  } catch (error) {
    console.error('CPU parse error (loadavg):', error, 'Output:', loadavgOutput);
  }
  return null;
}

/**
 * Parses CPU usage from macOS 'top -l 1' command output.
 * @param {string} rawData - Output from `top -l 1 -s 0 | grep "CPU usage"`.
 * @returns {number|null} CPU usage percentage.
 */
function parseMacOsCpuUsage(rawData) {
  try {
    const match = rawData.match(/CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys,\s*([\d.]+)% idle/);
    if (match) {
      const userCpu = parseFloat(match[1]);
      const sysCpu = parseFloat(match[2]);
      return userCpu + sysCpu;
    }
  } catch (error) {
    console.error('macOS CPU parse error (top):', error, 'Output:', rawData);
  }
  return null;
}

/**
 * Parses disk usage from 'df' command output formatted as "totalKBlocks_usedKBlocks_Percent".
 * @param {string} dfOutput - The command output string.
 * @returns {{totalMB: number, usedMB: number, percent: number}|null} An object with total disk space, used disk space (both in MB), and usage percentage, or null if parsing fails.
 */
function parseDiskUsage(dfOutput) {
  try {
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
    console.error('Disk parse error (totalKB_usedKB_percent):', error, 'Output:', dfOutput);
  }
  return null;
}

/**
 * Fetches remote system statistics (CPU, RAM, Disk) for a given SSH connection and sends them to the renderer process.
 * Uses OS-specific commands and parsers.
 * @param {string} connectionId - The ID of the SSH connection.
 */
async function fetchAndSendRemoteStats(connectionId) {
  if (!mainWindow || mainWindow.isDestroyed() || !SSHClient.getConnection(connectionId)) {
    if (activeStatIntervals.has(connectionId)) {
      clearInterval(activeStatIntervals.get(connectionId));
      activeStatIntervals.delete(connectionId);
    }
    return;
  }

  const osType = connectionOsTypes.get(connectionId) || 'linux'; // Default to linux if not found

  let ramUsage = null;
  let cpuUsage = null;
  let diskUsage = null;

  try {
    if (osType === 'linux') {
      // Tek bir komutla tüm sistem bilgilerini al (kanal sorunu için)
      const combinedCommand = `echo "=RAM="; free -m; echo "=CPU="; cat /proc/loadavg; echo "=DISK="; df -P / | tail -n 1 | awk '{print $2 "_" $3 "_" $5}' | sed 's/%//g'`;
      
      try {
        const combinedResult = await SSHClient.executeCommand(connectionId, combinedCommand);
        console.log(`[${connectionId}] Kombine komut çıktısı:`, combinedResult);
        
        // Çıktıyı parse et
        const sections = combinedResult.split('=');
        
        // RAM parse et
        const ramSection = sections.find(s => s.includes('total') && s.includes('Mem:'));
        if (ramSection) {
          ramUsage = parseLinuxRamUsage(ramSection);
          if (ramUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `Kombine komut - RAM başarılı: ${ramUsage.percent.toFixed(1)}%`
            });
          }
        }
        
        // CPU parse et
        const cpuSection = sections.find(s => s.includes(' ') && s.match(/^\s*[\d.]+/));
        if (cpuSection) {
          cpuUsage = parseCpuUsage(cpuSection.trim());
          if (cpuUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `Kombine komut - CPU başarılı: ${cpuUsage.toFixed(1)}%`
            });
          }
        }
        
        // Disk parse et
        const diskSection = sections.find(s => s.includes('_') && s.match(/^\s*\d+_\d+_\d+/));
        if (diskSection) {
          diskUsage = parseDiskUsage(diskSection.trim());
          if (diskUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `Kombine komut - Disk başarılı: ${diskUsage.percent}%`
            });
          }
        }
        
        if (ramUsage && cpuUsage && diskUsage) {
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `Kombine komut tamamen başarılı! 🎉`
          });
        }
        
      } catch (combinedError) {
        console.error(`[${connectionId}] Kombine komut başarısız, tekli komutlara geçiliyor:`, combinedError.message);
        
        // Kombine komut başarısızsa, tekli komutları dene (eski yöntem)
        const ramCommand = 'free -m';
        const cpuCommand = "cat /proc/loadavg";
        const diskCommand = "df -P / | tail -n 1 | awk '{print $2 \"_\" $3 \"_\" $5}' | sed 's/%//g'";

        try {
          const rawRamData = await SSHClient.executeCommand(connectionId, ramCommand);
          console.log(`[${connectionId}] RAM komut çıktısı:`, rawRamData);
          ramUsage = parseLinuxRamUsage(rawRamData);
          if (!ramUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `RAM komutu çalıştı ama parse edilemedi: ${rawRamData?.substring(0, 100)}...`
            });
          }
        } catch (ramError) {
          console.error(`[${connectionId}] RAM komut hatası:`, ramError.message);
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `RAM komutu başarısız: ${ramError.message}`
          });
        }

        try {
          const rawCpuData = await SSHClient.executeCommand(connectionId, cpuCommand);
          console.log(`[${connectionId}] CPU komut çıktısı:`, rawCpuData);
          cpuUsage = parseCpuUsage(rawCpuData);
          if (!cpuUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `CPU komutu çalıştı ama parse edilemedi: ${rawCpuData?.substring(0, 100)}...`
            });
          }
        } catch (cpuError) {
          console.error(`[${connectionId}] CPU komut hatası:`, cpuError.message);
          
          // Channel open failure için alternatif CPU komutları dene
          if (cpuError.message.includes('Channel open failure')) {
            console.log(`[${connectionId}] Channel failure - alternatif CPU komutları deneniyor...`);
            
            const alternativeCpuCommands = [
              'uptime',
              'cat /proc/stat | head -1',
              'who'
            ];
            
            for (const altCommand of alternativeCpuCommands) {
              try {
                console.log(`[${connectionId}] Alternatif CPU komutu deneniyor: ${altCommand}`);
                const altResult = await SSHClient.executeCommand(connectionId, altCommand);
                console.log(`[${connectionId}] Alternatif CPU komut başarılı: ${altResult?.substring(0, 100)}`);
                
                if (altCommand === 'uptime') {
                  // uptime çıktısından load average'ı parse et
                  const uptimeMatch = altResult.match(/load average:\s*([\d.]+)/);
                  if (uptimeMatch) {
                    const load = parseFloat(uptimeMatch[1]);
                    cpuUsage = Math.min(load * 100, 100);
                    mainWindow.webContents.send('remote-system-info-update', {
                      connectionId,
                      debug: `CPU alternatif komut (uptime) başarılı: Load ${load}`
                    });
                    break;
                  }
                }
                
                // İlk çalışan komutla işleme devam et
                mainWindow.webContents.send('remote-system-info-update', {
                  connectionId,
                  debug: `CPU alternatif komut çalıştı: ${altCommand}`
                });
                break;
                
              } catch (altError) {
                console.log(`[${connectionId}] Alternatif komut '${altCommand}' da başarısız: ${altError.message}`);
              }
            }
            
            if (!cpuUsage) {
              mainWindow.webContents.send('remote-system-info-update', {
                connectionId,
                debug: `Tüm CPU komutları başarısız - SSH kanal sorunu`
              });
            }
          } else {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `CPU komutu başarısız: ${cpuError.message}`
            });
          }
        }

        try {
          const rawDiskData = await SSHClient.executeCommand(connectionId, diskCommand);
          console.log(`[${connectionId}] Disk komut çıktısı:`, rawDiskData);
          diskUsage = parseDiskUsage(rawDiskData);
          if (!diskUsage) {
            mainWindow.webContents.send('remote-system-info-update', {
              connectionId,
              debug: `Disk komutu çalıştı ama parse edilemedi: ${rawDiskData?.substring(0, 100)}...`
            });
          }
        } catch (diskError) {
          console.error(`[${connectionId}] Disk komut hatası:`, diskError.message);
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `Disk komutu başarısız: ${diskError.message}`
          });
        }
      } // kombinedError catch bloğunu kapat

    } else if (osType === 'macos') {
      const ramCommand = "top -l 1 -s 0 | grep PhysMem";
      const cpuCommand = "top -l 1 -s 0 | grep \"CPU usage\"";
      const diskCommand = "df -k / | tail -n 1 | awk '{print $2 \"_\" $3 \"_\" $5}' | sed 's/%//g'";

      try {
        const rawRamData = await SSHClient.executeCommand(connectionId, ramCommand);
        console.log(`[${connectionId}] macOS RAM komut çıktısı:`, rawRamData);
        ramUsage = parseMacOsTopRam(rawRamData);
        if (!ramUsage) {
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `macOS RAM komutu çalıştı ama parse edilemedi: ${rawRamData?.substring(0, 100)}...`
          });
        }
      } catch (ramError) {
        console.error(`[${connectionId}] macOS RAM komut hatası:`, ramError.message);
        mainWindow.webContents.send('remote-system-info-update', {
          connectionId,
          debug: `macOS RAM komutu başarısız: ${ramError.message}`
        });
      }

      try {
        const rawCpuData = await SSHClient.executeCommand(connectionId, cpuCommand);
        console.log(`[${connectionId}] macOS CPU komut çıktısı:`, rawCpuData);
        cpuUsage = parseMacOsCpuUsage(rawCpuData);
        if (!cpuUsage) {
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `macOS CPU komutu çalıştı ama parse edilemedi: ${rawCpuData?.substring(0, 100)}...`
          });
        }
      } catch (cpuError) {
        console.error(`[${connectionId}] macOS CPU komut hatası:`, cpuError.message);
        mainWindow.webContents.send('remote-system-info-update', {
          connectionId,
          debug: `macOS CPU komutu başarısız: ${cpuError.message}`
        });
      }

      try {
        const rawDiskData = await SSHClient.executeCommand(connectionId, diskCommand);
        console.log(`[${connectionId}] macOS Disk komut çıktısı:`, rawDiskData);
        diskUsage = parseDiskUsage(rawDiskData);
        if (!diskUsage) {
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `macOS Disk komutu çalıştı ama parse edilemedi: ${rawDiskData?.substring(0, 100)}...`
          });
        }
      } catch (diskError) {
        console.error(`[${connectionId}] macOS Disk komut hatası:`, diskError.message);
        mainWindow.webContents.send('remote-system-info-update', {
          connectionId,
          debug: `macOS Disk komutu başarısız: ${diskError.message}`
        });
      } 

    } else if (osType === 'windows') {
      // PowerShell commands to output: totalKB_usedKB_percent for RAM/Disk, float for CPU
      const ramCommandWin = `powershell -Command "try { $mem = Get-CimInstance Win32_OperatingSystem; $total = [math]::Round($mem.TotalVisibleMemorySize / 1KB); $free = [math]::Round($mem.FreePhysicalMemory / 1KB); $used = $total - $free; $percent = if ($total -gt 0) {[math]::Round(($used * 100 / $total), 0)} else {0}; Write-Host ($total.ToString() + \"_\" + $used.ToString() + \"_\" + $percent.ToString()) } catch { Write-Host \"error_ram\" }"`;
      const cpuCommandWin = `powershell -Command "try { Write-Host (Get-Counter '\\Processor Information(_Total)\\% Processor Time').CounterSamples[0].CookedValue } catch { Write-Host \"error_cpu\" }"`;
      const diskCommandWin = `powershell -Command "try { $disk = Get-PSDrive C; $total = [math]::Round(($disk.Used + $disk.Free) / 1KB); $used = [math]::Round($disk.Used / 1KB); $percent = if ($total -gt 0) {[math]::Round(($used * 100 / $total), 0)} else {0}; Write-Host ($total.ToString() + \"_\" + $used.ToString() + \"_\" + $percent.ToString()) } catch { Write-Host \"error_disk\" }"`;
      
      console.warn(`[${connectionId}] Attempting to fetch stats for Windows. This is experimental.`);

      try {
        const rawRamData = await SSHClient.executeCommand(connectionId, ramCommandWin);
        if (rawRamData && !rawRamData.includes("error_ram")) ramUsage = parseKbTotalUsedPercentRam(rawRamData);
        else console.warn(`[${connectionId}] Failed to get Windows RAM stats or command error.`);

        const rawCpuData = await SSHClient.executeCommand(connectionId, cpuCommandWin);
        if (rawCpuData && !rawCpuData.includes("error_cpu")) cpuUsage = parseCpuUsage(rawCpuData);
        else console.warn(`[${connectionId}] Failed to get Windows CPU stats or command error.`);
        
        const rawDiskData = await SSHClient.executeCommand(connectionId, diskCommandWin);
        if (rawDiskData && !rawDiskData.includes("error_disk")) diskUsage = parseDiskUsage(rawDiskData);
        else console.warn(`[${connectionId}] Failed to get Windows Disk stats or command error.`);

      } catch (winStatError) {
        console.error(`[${connectionId}] Error executing PowerShell commands for Windows stats: ${winStatError.message}`);
      }
    } else {
      console.warn(`[${connectionId}] OS type '${osType}' not fully supported for stats collection.`);
      mainWindow.webContents.send('remote-system-info-update', {
        connectionId,
        debug: `Desteklenmeyen OS tipi: ${osType} - Basit komutlar deneniyor...`
      });
      
      try {
        const simpleMemCommand = 'cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable"';
        const simpleCpuCommand = 'cat /proc/loadavg';
        const simpleDiskCommand = 'df -h / | tail -n 1';
        
        try {
          const memResult = await SSHClient.executeCommand(connectionId, simpleMemCommand);
          console.log(`[${connectionId}] Basit MEM komut çıktısı:`, memResult);
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `Basit MEM komutu çalıştı: ${memResult?.substring(0, 100)}...`
          });
        } catch (memError) {
          console.error(`[${connectionId}] Basit MEM komut hatası:`, memError.message);
        }
        
        try {
          const cpuResult = await SSHClient.executeCommand(connectionId, simpleCpuCommand);
          console.log(`[${connectionId}] Basit CPU komut çıktısı:`, cpuResult);
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `Basit CPU komutu çalıştı: ${cpuResult?.substring(0, 100)}...`
          });
        } catch (cpuError) {
          console.error(`[${connectionId}] Basit CPU komut hatası:`, cpuError.message);
        }
        
        try {
          const diskResult = await SSHClient.executeCommand(connectionId, simpleDiskCommand);
          console.log(`[${connectionId}] Basit Disk komut çıktısı:`, diskResult);
          mainWindow.webContents.send('remote-system-info-update', {
            connectionId,
            debug: `Basit Disk komutu çalıştı: ${diskResult?.substring(0, 100)}...`
          });
        } catch (diskError) {
          console.error(`[${connectionId}] Basit Disk komut hatası:`, diskError.message);
        }
      } catch (error) {
        console.error(`[${connectionId}] Basit komutlar da başarısız:`, error.message);
        mainWindow.webContents.send('remote-system-info-update', {
          connectionId,
          debug: `Tüm komutlar başarısız: ${error.message}`
        });
      }
    }

    if (ramUsage || cpuUsage || diskUsage) {
      mainWindow.webContents.send('remote-system-info-update', {
        connectionId,
        cpu: cpuUsage,     
        mem: ramUsage ? ramUsage.percent : null, 
        memTotalMB: ramUsage ? ramUsage.total : null,
        memUsedMB: ramUsage ? ramUsage.used : null,
        disk: diskUsage ? diskUsage.percent : null, 
        diskTotalMB: diskUsage ? diskUsage.totalMB : null,
        diskUsedMB: diskUsage ? diskUsage.usedMB : null,
      });
    }
  } catch (error) {
    console.error(`[${connectionId}] Error fetching remote stats (os: ${osType}):`, error.message);
    if (error.message.includes('SSH connection not found')) {
        if (activeStatIntervals.has(connectionId)) {
            clearInterval(activeStatIntervals.get(connectionId));
            activeStatIntervals.delete(connectionId);
            connectionOsTypes.delete(connectionId);
            mainWindow.webContents.send('clear-remote-system-info', { connectionId });
        }
    }
  }
}

/**
 * Creates the main application window.
 * Sets up window properties, loads the main HTML file, and configures the application menu.
 * Opens DevTools if the '--debug' argument is present.
 */
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
    icon: path.join(__dirname, 'ssh-logo.png')
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
/**
 * IPC Handler: Retrieves all saved connections from the store.
 * @returns {Array<Object>} An array of saved connection objects.
 */
ipcMain.handle('get-saved-connections', () => {
  return store.get('connections') || [];
});

/**
 * IPC Handler: Saves a new connection or updates an existing one in the store.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} connection - The connection object to save.
 * @returns {Array<Object>} The updated list of all connections.
 */
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

/**
 * IPC Handler: Deletes a connection from the store by its ID.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the connection to delete.
 * @returns {Array<Object>} The updated list of all connections.
 */
ipcMain.handle('delete-connection', (event, connectionId) => {
  const connections = store.get('connections') || [];
  const updatedConnections = connections.filter(conn => conn.id !== connectionId);
  store.set('connections', updatedConnections);
  return updatedConnections;
});

// SSH bağlantısı kurulduğunda istatistik çekmeyi ve SFTP bağlamayı başlat
/**
 * IPC Handler: Establishes an SSH connection, detects OS, and starts services.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} connectionConfig - The configuration object for the SSH connection.
 * @returns {Promise<{success: boolean, connectionId?: string, error?: string}>} An object indicating success or failure,
 * with connectionId on success, or an error message on failure.
 */
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
          mainWindow.webContents.send('clear-remote-system-info', { connectionId: closedConnectionId });
        }
        connectionOsTypes.delete(closedConnectionId);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sftp-close', { sshConnectionId: closedConnectionId, reason: 'ssh_shell_closed' });
        }
      }
    );

    // OS Detection
    let osType = 'unknown';
    try {
        const unameOutput = (await SSHClient.executeCommand(currentSshConnectionId, 'uname -s')).trim().toLowerCase();
        if (unameOutput.includes('linux')) {
            osType = 'linux';
        } else if (unameOutput.includes('darwin')) {
            osType = 'macos';
        } else if (unameOutput.includes('cygwin') || unameOutput.includes('mingw') || unameOutput.includes('msys')) {
            osType = 'windows'; 
        } else {
            try {
                await SSHClient.executeCommand(currentSshConnectionId, 'ver'); 
                osType = 'windows';
            } catch (e) {
                console.warn(`[${currentSshConnectionId}] OS detection: uname -s gave '${unameOutput}', 'ver' also failed. Defaulting to linux as a fallback.`);
                osType = 'linux'; 
            }
        }
    } catch (err) {
        try {
            await SSHClient.executeCommand(currentSshConnectionId, 'ver');
            osType = 'windows';
        } catch (winErr) {
            console.warn(`[${currentSshConnectionId}] OS detection failed for both 'uname -s' and 'ver'. Defaulting to linux. Errors: ${err.message}, ${winErr.message}`);
            osType = 'linux'; 
        }
    }
    connectionOsTypes.set(currentSshConnectionId, osType);
    console.warn(`[${currentSshConnectionId}] Detected OS type: ${osType}`); // Keep for debugging this new feature

    // İlk debug mesajını gönder
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote-system-info-update', {
        connectionId: currentSshConnectionId,
        debug: `Bağlantı kuruldu - OS: ${osType.toUpperCase()} - Sistem bilgileri toplanıyor...`
      });
    }

    // İstatistik çekme interval'ını başlat
    if (!activeStatIntervals.has(currentSshConnectionId)) {
      fetchAndSendRemoteStats(currentSshConnectionId); 
      const intervalId = setInterval(() => fetchAndSendRemoteStats(currentSshConnectionId), STAT_INTERVAL_MS);
      activeStatIntervals.set(currentSshConnectionId, intervalId);
    }

    // SSH bağlantısı başarılı, şimdi SFTP bağlamayı dene
    try {
      // SFTPClient'ın connect metodu SSHClient'ın config objesine benzer bir config bekler.
      // Gerekirse connectionConfig'i SFTPClient için uyarlayın.
      const sftpConfig = { ...connectionConfig, // host, port, username, password, privateKeyPath, passphrase
        // SFTP'ye özel ek ayarlar buraya gelebilir
      };
      const sftpConnectionId = await SFTPClient.connect(sftpConfig);
      
      // Başlangıç dizinini PWD komutu ile al
      let initialPath = '/'; // Varsayılan
      try {
        if (osType === 'windows') {
          // Try to get user's home directory on Windows via PowerShell, then fall back to C:\ or / if error
          try {
            const homePathOutput = await SSHClient.executeCommand(currentSshConnectionId, "powershell -Command \"Write-Host $HOME\"");
            if (homePathOutput && homePathOutput.trim() !== '') {
              initialPath = homePathOutput.trim().replace(/\\/g, '/'); // Normalize to forward slashes
            } else {
              initialPath = 'C:/'; // Fallback for Windows if $HOME is empty
            }
          } catch (psHomeError) {
            console.warn(`[${currentSshConnectionId}] PowerShell $HOME failed, trying / C:. Error: ${psHomeError.message}`);
            initialPath = 'C:/'; // Further fallback
          }
        } else {
            const pwdOutput = await SSHClient.executeCommand(currentSshConnectionId, 'pwd');
            if (pwdOutput) initialPath = pwdOutput.trim();
        }
      } catch (pathError) {
        console.warn(`[${currentSshConnectionId}] Error getting initial SFTP path (os: ${osType}), using '/':`, pathError.message);
        initialPath = (osType === 'windows') ? 'C:/' : '/';
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
    if (currentSshConnectionId) { // Ensure ID exists before trying to delete
        connectionOsTypes.delete(currentSshConnectionId);
        if (activeStatIntervals.has(currentSshConnectionId)) {
            clearInterval(activeStatIntervals.get(currentSshConnectionId));
            activeStatIntervals.delete(currentSshConnectionId);
        }
    }
    return { success: false, error: error.message };
  }
});

// SSH bağlantısı kesildiğinde istatistik çekmeyi ve SFTP'yi durdur/temizle
/**
 * IPC Handler: Disconnects an SSH connection.
 * Stops the remote statistics interval and closes the SSH and associated SFTP connections.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} sshConnectionId - The ID of the SSH connection to disconnect.
 * @returns {{success: boolean, error?: string}} An object indicating success or failure.
 */
ipcMain.handle('disconnect-ssh', (event, sshConnectionId) => {
  try {
    if (activeStatIntervals.has(sshConnectionId)) {
      clearInterval(activeStatIntervals.get(sshConnectionId));
      activeStatIntervals.delete(sshConnectionId);
      if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('clear-remote-system-info', { connectionId: sshConnectionId });
      }
    }
    connectionOsTypes.delete(sshConnectionId);
    SSHClient.close(sshConnectionId);
    
    // İlgili SFTP bağlantısını da kapat ve arayüzü bilgilendir.
    // Bu, SFTP bağlantılarının SSH ID'leri ile eşlenmesini gerektirir.
    // Şimdilik genel bir sftp-close gönderiyoruz, renderer tarafı ilgilenir.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sftp-close', { sshConnectionId: sshConnectionId, reason: 'ssh_disconnected' });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Writes data to an active SSH connection.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SSH connection.
 * @param {string} data - The data to write to the SSH terminal.
 * @returns {{success: boolean, error?: string}} An object indicating success or failure.
 */
ipcMain.handle('write-ssh', (event, connectionId, data) => {
  try {
    SSHClient.write(connectionId, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Resizes an SSH terminal (pseudo-terminal).
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SSH connection.
 * @param {number} cols - The number of columns for the terminal.
 * @param {number} rows - The number of rows for the terminal.
 * @returns {{success: boolean, error?: string}} An object indicating success or failure.
 */
ipcMain.handle('resize-ssh', (event, connectionId, cols, rows) => {
  try {
    SSHClient.resize(connectionId, cols, rows);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers for file dialogs
/**
 * IPC Handler: Shows an open file dialog.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Electron.OpenDialogOptions} options - Options for the open file dialog.
 * @returns {Promise<Electron.OpenDialogReturnValue>} A promise that resolves with the dialog's result.
 */
ipcMain.handle('open-file-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return await dialog.showOpenDialog(mainWindow, options);
});

/**
 * IPC Handler: Shows a save file dialog.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Electron.SaveDialogOptions} options - Options for the save file dialog.
 * @returns {Promise<Electron.SaveDialogReturnValue>} A promise that resolves with the dialog's result.
 */
ipcMain.handle('save-file-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true, filePath: undefined };
  return await dialog.showSaveDialog(mainWindow, options);
});

/**
 * IPC Handler: Gets the user's home directory path.
 * @returns {string} The path to the user's home directory.
 */
ipcMain.handle('get-home-path', () => {
  return os.homedir();
});

// IPC Handlers for message dialogs
/**
 * IPC Handler: Shows a message box.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Electron.MessageBoxOptions} options - Options for the message box.
 * @returns {Promise<Electron.MessageBoxReturnValue> | undefined} A promise that resolves with the message box's result, or undefined if no main window.
 */
ipcMain.handle('show-message', async (event, options) => {
  if (!mainWindow) return { response: 0 }; // Should match a possible dialog response if needed
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

/**
 * IPC Handler: Shows a confirmation dialog.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Electron.MessageBoxOptions} options - Options for the confirmation dialog.
 * @returns {Promise<Electron.MessageBoxReturnValue>} A promise that resolves with the dialog's result.
 */
ipcMain.handle('show-confirm-dialog', async (event, options) => {
  if (!mainWindow) return { response: 1 }; 
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
/**
 * IPC Handler: Reads text from the system clipboard.
 * @returns {string} The text content from the clipboard.
 */
ipcMain.handle('read-clipboard', () => {
  return clipboard.readText();
});

/**
 * IPC Handler: Writes text to the system clipboard.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} text - The text to write to the clipboard.
 * @returns {boolean} True if the operation was successful.
 */
ipcMain.handle('write-clipboard', (event, text) => {
  clipboard.writeText(text);
  return true;
});

// IPC Handlers for SFTP operations
/**
 * IPC Handler: Connects to an SFTP server.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} connection - SFTP connection configuration object.
 * @returns {Promise<{success: boolean, connectionId?: string, error?: string}>} Result object.
 */
ipcMain.handle('connect-sftp', async (event, connection) => {
  try {
    // Connect to the SFTP server
    const connectionId = await SFTPClient.connect(connection);
    return { success: true, connectionId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Disconnects from an SFTP server.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('disconnect-sftp', async (event, connectionId) => {
  try {
    await SFTPClient.disconnect(connectionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Lists files and directories in a remote path using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @param {string} remotePath - The remote path to list.
 * @returns {Promise<{success: boolean, list?: Array<Object>, error?: string}>} Result object with file list on success.
 */
ipcMain.handle('sftp-list', async (event, connectionId, remotePath) => {
  try {
    const list = await SFTPClient.list(connectionId, remotePath);
    return { success: true, list };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Creates a directory on the remote server using SFTP (via sudo on SSH).
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.connectionId - The ID of the SFTP connection (used for logging if sshConnectionId fails).
 * @param {string} params.remotePath - The remote path where the directory should be created.
 * @param {string} params.sshConnectionId - The ID of the associated SSH connection for sudo command.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('sftp-mkdir', async (event, { connectionId, remotePath, sshConnectionId }) => {
  try {
    if (!sshConnectionId) {
      throw new Error('SSH connection ID is required for sudo mkdir.');
    }
    const osType = connectionOsTypes.get(sshConnectionId) || 'linux';
    let command;
    if (osType === 'windows') {
      // Assuming remotePath could be like 'C:/Users/user/NewFolder'
      // PowerShell mkdir does not need -p and handles existing directories gracefully.
      command = `powershell -Command "New-Item -ItemType Directory -Path '${remotePath.replace(/'/g, "'''")}' -Force -ErrorAction SilentlyContinue"`;
    } else {
      command = `/bin/sh -c "sudo mkdir -p '${remotePath.replace(/'/g, "'''")}'"`;
    }
    await SSHClient.executeCommand(sshConnectionId, command);
    return { success: true };
  } catch (error) {
    console.error(`[${sshConnectionId || connectionId}] SFTP mkdir error for ${remotePath} (os: ${connectionOsTypes.get(sshConnectionId)}):`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Deletes a file on the remote server using SFTP (via sudo on SSH).
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.sftpConnectionId - The ID of the SFTP connection (used for logging if sshConnectionId fails).
 * @param {string} params.remotePath - The remote path of the file to delete.
 * @param {string} params.sshConnectionId - The ID of the associated SSH connection for sudo command.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('sftp-delete', async (event, { sftpConnectionId, remotePath, sshConnectionId }) => {
  try {
    if (!sshConnectionId) {
      throw new Error('SSH connection ID is required for sudo delete.');
    }
    const osType = connectionOsTypes.get(sshConnectionId) || 'linux';
    let command;
    if (osType === 'windows') {
      command = `powershell -Command "Remove-Item -Path '${remotePath.replace(/'/g, "'''")}' -Force -ErrorAction SilentlyContinue"`;
    } else {
      command = `/bin/sh -c "sudo rm -f '${remotePath.replace(/'/g, "'''")}'"`;
    }
    await SSHClient.executeCommand(sshConnectionId, command);
    return { success: true };
  } catch (error) {
    console.error(`[${sshConnectionId || sftpConnectionId}] SFTP delete error for ${remotePath} (os: ${connectionOsTypes.get(sshConnectionId)}):`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Deletes a directory (recursively if specified) on the remote server using SFTP (via sudo on SSH).
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.sftpConnectionId - The ID of the SFTP connection (used for logging if sshConnectionId fails).
 * @param {string} params.remotePath - The remote path of the directory to delete.
 * @param {boolean} params.recursive - Whether to delete recursively (not directly used by SFTPClient.rmdir, sudo command handles it).
 * @param {string} params.sshConnectionId - The ID of the associated SSH connection for sudo command.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('sftp-rmdir', async (event, { sftpConnectionId, remotePath, recursive, sshConnectionId }) => {
  try {
    if (!sshConnectionId) {
      throw new Error('SSH connection ID is required for sudo rmdir.');
    }
    const osType = connectionOsTypes.get(sshConnectionId) || 'linux';
    let command;
    if (osType === 'windows') {
      command = `powershell -Command "Remove-Item -Path '${remotePath.replace(/'/g, "'''")}' -Recurse -Force -ErrorAction SilentlyContinue"`;
    } else {
      command = `/bin/sh -c "sudo rm -rf '${remotePath.replace(/'/g, "'''")}'"`;
    }
    await SSHClient.executeCommand(sshConnectionId, command);
    return { success: true };
  } catch (error) {
    console.error(`[${sshConnectionId || sftpConnectionId}] SFTP rmdir error for ${remotePath} (os: ${connectionOsTypes.get(sshConnectionId)}):`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Renames/moves a file or directory on the remote server using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.connectionId - The ID of the SFTP connection.
 * @param {string} params.fromPath - The current remote path of the item.
 * @param {string} params.toPath - The new remote path for the item.
 * @param {string} [params.sshConnectionId] - Optional SSH connection ID for logging.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('sftp-rename', async (event, { connectionId, fromPath, toPath, sshConnectionId }) => {
  try {
    // SFTP rename is generally OS-agnostic at the SFTP protocol level.
    // If sudo mv is needed, that would require OS-specific shell commands via SSHClient.
    // For now, using standard SFTPClient.rename which should work cross-platform for basic renames.
    await SFTPClient.rename(connectionId, fromPath, toPath);
    return { success: true };
  } catch (error) {
    console.error(`[${sshConnectionId || connectionId}] SFTP rename error from ${fromPath} to ${toPath}:`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Downloads a file from the remote server using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @param {string} remotePath - The remote path of the file to download.
 * @param {string} localPath - The local path to save the downloaded file.
 * @returns {Promise<{success: boolean, transferId?: string, error?: string}>} Result object with transfer ID on success.
 */
ipcMain.handle('sftp-download', async (event, connectionId, remotePath, localPath) => {
  try {
    const transferId = await SFTPClient.download(connectionId, remotePath, localPath);
    return { success: true, transferId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Uploads a file to the remote server using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @param {string} localPath - The local path of the file to upload.
 * @param {string} remotePath - The remote path to save the uploaded file.
 * @returns {Promise<{success: boolean, transferId?: string, error?: string}>} Result object with transfer ID on success.
 */
ipcMain.handle('sftp-upload', async (event, connectionId, localPath, remotePath) => {
  try {
    const transferId = await SFTPClient.upload(connectionId, localPath, remotePath);
    return { success: true, transferId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Gets the status of an ongoing SFTP transfer.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} transferId - The ID of the transfer.
 * @returns {{success: boolean, status?: Object}} Result object with transfer status.
 */
ipcMain.handle('sftp-get-transfer-status', (event, transferId) => {
  const status = SFTPClient.getTransferStatus(transferId);
  return { success: true, status };
});

/**
 * IPC Handler: Cancels an ongoing SFTP transfer.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} transferId - The ID of the transfer to cancel.
 * @returns {{success: boolean}} Result object indicating if cancellation was successful.
 */
ipcMain.handle('sftp-cancel-transfer', (event, transferId) => {
  const cancelled = SFTPClient.cancelTransfer(transferId);
  return { success: cancelled };
});

/**
 * IPC Handler: Gets the current working directory for an SFTP connection.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @returns {{success: boolean, dir?: string, error?: string}} Result object with current directory on success.
 */
ipcMain.handle('sftp-get-current-directory', (event, connectionId) => {
  try {
    const dir = SFTPClient.getCurrentDirectory(connectionId);
    return { success: true, dir };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Sets the current working directory for an SFTP connection.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @param {string} remotePath - The remote path to set as the current directory.
 * @returns {{success: boolean, error?: string}} Result object.
 */
ipcMain.handle('sftp-set-current-directory', (event, connectionId, remotePath) => {
  try {
    SFTPClient.setCurrentDirectory(connectionId, remotePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Gets statistics for a remote file or directory using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} connectionId - The ID of the SFTP connection.
 * @param {string} remotePath - The remote path of the item.
 * @returns {Promise<{success: boolean, stats?: Object, error?: string}>} Result object with file stats on success.
 */
ipcMain.handle('sftp-stat', async (event, connectionId, remotePath) => {
  try {
    const stats = await SFTPClient.stat(connectionId, remotePath);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers for SFTP file operations
/**
 * IPC Handler: Reads the content of a remote file using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.connectionId - The ID of the SFTP connection.
 * @param {string} params.remoteFilePath - The remote path of the file to read.
 * @returns {Promise<{success: boolean, content?: Buffer|string, error?: string}>} Result object with file content on success.
 */
ipcMain.handle('sftp-read-file', async (event, { connectionId, remoteFilePath }) => {
  try {
    const content = await SFTPClient.readFile(connectionId, remoteFilePath);
    return { success: true, content };
  } catch (error) {
    console.error(`[${connectionId}] Error reading remote file ${remoteFilePath}:`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Writes content to a remote file using SFTP.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Parameters object.
 * @param {string} params.connectionId - The ID of the SFTP connection.
 * @param {string} params.remoteFilePath - The remote path of the file to write.
 * @param {string|Buffer} params.content - The content to write to the file.
 * @param {string} [params.sshConnectionId] - Optional SSH connection ID for logging.
 * @returns {Promise<{success: boolean, error?: string}>} Result object.
 */
ipcMain.handle('sftp-write-file', async (event, { connectionId, remoteFilePath, content, sshConnectionId }) => {
  try {
    // Standard SFTP write. If sudo is needed, it's more complex and would involve writing to a temp file
    // then using SSH to sudo mv and set permissions. For now, this is direct SFTP write.
    await SFTPClient.writeFile(connectionId, remoteFilePath, content);
    return { success: true };
  } catch (error) {
    console.error(`[${sshConnectionId || connectionId}] Error writing remote file ${remoteFilePath}:`, error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Creates a new local terminal session.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @returns {Promise<{success: boolean, terminalId?: string, error?: string}>} Result object with terminal ID on success.
 */
ipcMain.handle('create-local-terminal', async (event) => {
  try {
    const terminalId = `local_${Date.now()}`;
    
    // Determine shell based on platform
    let shell;
    if (process.platform === 'win32') {
      shell = process.env.COMSPEC || 'cmd.exe';
    } else {
      shell = process.env.SHELL || '/bin/bash';
    }
    
    // Create PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env
    });
    
    // Store the process
    localTerminals.set(terminalId, ptyProcess);
    
    // Handle process data
    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('local-terminal-data', terminalId, data);
      }
    });
    
    // Handle process exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      localTerminals.delete(terminalId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('local-terminal-exit', terminalId, exitCode || 0);
      }
    });
    
    return { success: true, terminalId };
  } catch (error) {
    console.error('Error creating local terminal:', error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Writes data to a local terminal.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} terminalId - The ID of the local terminal.
 * @param {string} data - The data to write to the terminal.
 * @returns {{success: boolean, error?: string}} Result object.
 */
ipcMain.handle('write-local-terminal', (event, terminalId, data) => {
  try {
    const terminal = localTerminals.get(terminalId);
    if (!terminal) {
      return { success: false, error: 'Terminal not found' };
    }
    
    terminal.write(data);
    return { success: true };
  } catch (error) {
    console.error('Error writing to local terminal:', error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Resizes a local terminal.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} terminalId - The ID of the local terminal.
 * @param {number} cols - Number of columns.
 * @param {number} rows - Number of rows.
 * @returns {{success: boolean}} Result object.
 */
ipcMain.handle('resize-local-terminal', (event, terminalId, cols, rows) => {
  try {
    const terminal = localTerminals.get(terminalId);
    if (terminal) {
      terminal.resize(cols, rows);
    }
    return { success: true };
  } catch (error) {
    console.error('Error resizing local terminal:', error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC Handler: Closes a local terminal.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {string} terminalId - The ID of the local terminal to close.
 * @returns {{success: boolean}} Result object.
 */
ipcMain.handle('close-local-terminal', (event, terminalId) => {
  try {
    const terminal = localTerminals.get(terminalId);
    if (terminal) {
      terminal.kill();
      localTerminals.delete(terminalId);
    }
    return { success: true };
  } catch (error) {
    console.error('Error closing local terminal:', error);
    return { success: true }; // Return success even if there's an error
  }
});