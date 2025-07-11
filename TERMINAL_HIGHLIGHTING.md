# 🎨 Terminal Highlighting Rehberi

Terminal'inizi daha güzel, kullanışlı ve eğlenceli hale getiren gelişmiş highlighting sistemi!

## 🚀 **Hızlı Başlangıç**

**⌘ + Shift + H** (Mac) veya **Ctrl + Shift + H** (Win/Linux) ile ayar panelini açın!

## ✨ **Özellikler**

### 1. **Akıllı Prompt Stilleri**

**ESKI:**
```bash
homeserver@homeserver:~$ 
```

**YENİ:**
```bash
🟢homeserver🔹@🔷homeserver🔹:🏠📁 ~🟪$ 
```

**Akıllı dizin tanıma:**
- 🏠 `~` (Home directory)
- ⚡ `/` (Root directory)  
- ⚙️ `/etc` (Config files)
- 📋 `/var/log` (Log files)
- 🔥 `git` (Git repositories)
- 🌐 `nginx/apache` (Web servers)
- 🐳 `docker` (Docker directories)
- 🗑️ `/tmp` (Temporary files)

### 2. **Real-time Çıktı Vurgulama**

#### **🌐 Network & IPs**
```bash
ping 192.168.1.1        # 🌐 192.168.1.1 (cyan background)
ssh user@server:22      # 🔌 :22 (magenta port)  
curl https://api.com    # 🔗 https://api.com (blue link)
```

#### **✅ ❌ Durum Mesajları**
```bash
✅ success completed     # Green background with checkmark
❌ error failed denied   # Red background with X
⚠️ warning caution      # Yellow background with warning
```

#### **💎 Sayılar & Boyutlar**
```bash
ls -lh file.txt         # 💎 1.5MB (yellow with diamond)
free -h                 # 💾 4GB memory highlighted
top                     # ⚡ 85%CPU highlighted
```

#### **🔐 Sistem Bilgileri**
```bash
ls -la                  # 🔐 drwxr-xr-x permissions
ps aux                  # 🔢 PID numbers
git branch              # 🔀 (main) branch names
```

#### **📧 Email & Dosyalar**
```bash
grep user@domain.com    # 📧 user@domain.com
cat /path/to/file       # Cyan underlined paths
```

## 🎛️ **Ayar Seçenekleri**

### **✨ Görsel Geliştirmeler**

1. **🎨 Akıllı Prompt Stilleri**
   - Kullanıcı@sunucu:📁klasör$ formatı
   - Akıllı dizin simgeleri
   - Renkli kullanıcı/host gösterimi

2. **🌈 Çıktı Vurgulama**
   - IP adresleri, URL'ler
   - Hata/başarı mesajları  
   - Dosya yolları ve sayılar

3. **😊 Emoji İkonları**
   - Klasörler için 📁
   - Durumlar için ✅❌⚠️
   - Network için 🌐🔌🔗

4. **🎬 Animasyonlar** (Gelecekte)
   - Yazma efektleri
   - Geçiş animasyonları

### **🎯 Hızlı Eylemler**

- **🔄 Varsayılana Sıfırla**: Tüm ayarları sıfırla
- **⚡ Tümünü Aç/Kapat**: Bütün özellikleri toggle et

## 🎭 **Kullanım Örnekleri**

### **Sistem Yönetimi**
```bash
🟢root🔹@🔷server🔹:⚡📁 /🟪# systemctl status nginx
✅ active (running) since 💎 2h 15m ago
🔌 :80 🔌 :443 listening on 🌐 0.0.0.0
```

### **Dosya İşlemleri**  
```bash
🟢user🔹@🔷dev🔹:🔥📁 ~/project🟪$ ls -la
🔐 drwxr-xr-x 💎 5 user group 💾 4.0K file.txt
🔐 -rw-r--r-- 💎 1 user group 💾 1.2M image.png
```

### **Network İşlemleri**
```bash
🟢admin🔹@🔷server🔹:🌐📁 /etc/nginx🟪$ ping 🌐 8.8.8.8
💎 64 bytes from 🌐 8.8.8.8: time=💎 15ms
```

### **Git İşlemleri**
```bash
🟢dev🔹@🔷laptop🔹:🔥📁 ~/myapp🟪$ git status
On branch 🔀 (feature/new-ui)
✅ nothing to commit, working tree clean
```

## ⚡ **Klavye Kısayolları**

| Kısayol | Açıklama |
|---------|----------|
| **⌘/Ctrl + Shift + H** | Terminal ayarları paneli |
| **⌘/Ctrl + Shift + D** | Sistem debug paneli |
| **Tab** | Otomatik tamamlama |
| **↑ ↓** | Komut geçmişi |

## 🎪 **Gelişmiş Özellikler**

### **Akıllı Tanıma Sistemleri**

1. **Dizin Türü Tanıma**: `/etc`, `/var`, `/tmp` gibi özel dizinler
2. **Dosya Türü Tanıma**: Log files, config files, executables  
3. **Komut Türü Tanıma**: System, network, file commands
4. **Durum Tanıma**: Success, error, warning patterns

### **Performans**

- **Hafif**: Minimal CPU kullanımı
- **Hızlı**: Real-time processing
- **Akıllı**: Sadece gerektiğinde highlighting
- **Özelleştirilebilir**: Her özellik açılıp kapatılabilir

## 🚀 **Gelecek Özellikler**

- **🎬 Animasyonlar**: Typing effects, transitions
- **🎵 Ses Efektleri**: Success/error sounds  
- **🎨 Tema Desteği**: Light/dark/custom themes
- **🤖 AI Önerileri**: Smart command suggestions
- **📊 İstatistikler**: Command usage analytics

## 🔧 **Sorun Giderme**

### **Renkler Görünmüyor?**
- Terminal'in ANSI color desteğini kontrol edin
- Settings panelinde "Çıktı Vurgulama" açık olduğundan emin olun

### **Emojiler Bozuk Görünüyor?**
- Font'unuzun emoji desteği olmalı
- Settings'den "Emoji İkonları" kapatabilirsiniz

### **Yavaş Çalışıyor?**
- Settings'den gereksiz özellikleri kapatın
- Büyük çıktılarda highlighting otomatik olarak azalır

## 💡 **İpuçları**

1. **⌘+Shift+H** ile ayarları kolayca açın
2. **Önizleme** alanından değişiklikleri canlı görün  
3. **Emoji'leri** sevmiyorsanız kapatabilirsiniz
4. **Performans** için sadece ihtiyacınız olanları açın
5. **Debug panel** ile sistem sorunlarını tespit edin

---

**🎨 Terminal artık sadece bir komut satırı değil, güzel bir çalışma ortamı!** 