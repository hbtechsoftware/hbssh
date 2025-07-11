# 🔧 Sistem Bilgisi Debug Rehberi

## Sorun Tanımı

Sunucuya bağlandıktan sonra CPU, MEM ve Disk bilgilerini göremiyorsanız, bu rehber size yardımcı olacaktır.

## Debug Adımları

### 1. Debug Paneli Açma

**Mac**: **⌘ + Shift + D** tuşlarına basın
**Windows/Linux**: **Ctrl + Shift + D** tuşlarına basın

### 2. Status Bar'da Debug Bilgilerini Kontrol Edin

Sunucuya bağlandıktan sonra status bar'da aşağıdaki mesajları görebilirsiniz:

- `Bağlantı kuruldu - OS: LINUX - Sistem bilgileri toplanıyor...`
- `RAM komutu çalıştı ama parse edilemedi...`
- `CPU komutu başarısız: Channel open failure...`

### 3. Muhtemel Sorunlar ve Çözümleri

#### A. Komut Bulunmuyor Hatası

**Sorun**: `command not found` hatası alıyorsunuz

**Çözüm**:
```bash
# Sunucunuzda bu komutları test edin:
which free
which top
which df
which awk
which sed
```

#### B. Yetki Problemi

**Sorun**: `permission denied` hatası alıyorsunuz

**Çözüm**:
```bash
# SSH kullanıcınızın yetkileri yeterli mi kontrol edin:
whoami
id
groups
```

#### C. Komut Çıktısı Farklı

**Sorun**: Komut çalışıyor ama parse edilemiyor

**Çözüm**:
```bash
# Manuel olarak komutları test edin:
free -m
top -bn1 | head -5
df -P / | tail -n 1
```

### 4. Manuel Test Komutları

Terminal üzerinde bu komutları tek tek çalıştırarak test edin:

#### Linux İçin:
```bash
# RAM Testi
free -m
free -h

# CPU Testi  
top -bn1 | head -5
cat /proc/loadavg
uptime

# Disk Testi
df -h
df -P /
```

#### macOS İçin:
```bash
# RAM Testi
top -l 1 -s 0 | grep PhysMem
vm_stat

# CPU Testi
top -l 1 -s 0 | grep "CPU usage"
uptime

# Disk Testi
df -h /
df -k /
```

### 5. Alternatif Komutlar

Standart komutlar çalışmıyorsa bu alternatifleri deneyin:

```bash
# RAM için alternatifler
cat /proc/meminfo | head -10
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable"

# CPU için alternatifler
cat /proc/loadavg
cat /proc/cpuinfo | grep processor | wc -l

# Disk için alternatifler
du -sh /
find / -maxdepth 1 -type d -exec du -sh {} \; 2>/dev/null | sort -rh | head -10
```

### 6. Sistem Bilgisi Toplama

Sunucunuz hakkında genel bilgi almak için:

```bash
# Sistem bilgisi
uname -a
lsb_release -a
cat /etc/os-release
hostnamectl

# Donanım bilgisi
lscpu
cat /proc/cpuinfo
cat /proc/meminfo
lsblk
```

### 7. Log Kontrolü

Electron Developer Tools'u açın:
- **View** → **Toggle Developer Tools**
- **Console** sekmesine gidin
- SSH bağlantısı sırasında hata mesajlarını kontrol edin

### 8. Yaygın Sorunlar

#### Problem 1: "SSH connection not found"
**Çözüm**: SSH bağlantısı kesiliyor, yeniden bağlanmayı deneyin

#### Problem 2: "Command timed out"
**Çözüm**: Sunucu yavaş, timeout süresini artırın

#### Problem 3: "Parse error"
**Çözüm**: Komut çıktısı beklenenden farklı, manuel test yapın

#### Problem 4: "Permission denied"
**Çözüm**: SSH kullanıcısının yetkileri yeterli değil

### 9. Desteklenen İşletim Sistemleri

- ✅ **Linux** (Ubuntu, CentOS, Debian, RHEL)
- ✅ **macOS** (macOS Server)
- ⚠️ **Windows** (PowerShell gerekli, deneysel)
- ❌ **FreeBSD** (yakında eklenecek)

### 10. Yardım İsteme

Sorun devam ediyorsa aşağıdaki bilgileri toplayın:

1. **Sunucu Bilgileri**:
   ```bash
   uname -a
   cat /etc/os-release
   ```

2. **Kullanıcı Bilgileri**:
   ```bash
   whoami
   id
   groups
   ```

3. **Komut Testi**:
   ```bash
   free -m
   top -bn1 | head -5
   df -P / | tail -n 1
   ```

4. **Hata Mesajları**:
   - Status bar'daki debug mesajları
   - Developer Console'daki hata logları

Bu bilgileri GitHub Issues'a gönderin veya destek ekibine iletin.

## Sonuç

Debug sistemi sayesinde sistem bilgilerinin neden görünmediğini kolayca tespit edebilir ve çözüm bulabilirsiniz. Çoğu sorun SSH kullanıcı yetkileri veya eksik komutlardan kaynaklanmaktadır.

**Mac'te ⌘ + Shift + D**, **Windows/Linux'te Ctrl + Shift + D** ile debug panelini açmayı unutmayın! 