# Snaked: Mimari ve Yol Haritası Önerisi

Taslak, 15 Ekim 2026. Amaç: macOS, Windows ve Linux'ta çalışan, kullanıcının bilgisayarda yapabildiği her şeyi yapabilen, maskotu yılan olan açık kaynaklı bir masaüstü agent.

Buğra'nın kararları: agent sıfırdan yazılır; kullanıcı hem mevcut ChatGPT ve Claude aboneliğiyle hem API anahtarıyla hem de Ollama gibi yerel modellerle bağlanabilir; "her şeyi yapabilecek" düzeyde ve güzel görünmeli; mimariyi Claude seçer. Aşağıdaki yığın ve lisans bu yüzden öneri değil, seçilmiş karardır.

## 1. Rakipler ve onlardan alınacak dersler

| Proje | Ne yapıyor | Bizim için ders |
|---|---|---|
| UI-TARS Desktop (ByteDance) | Electron uygulaması, kendi görsel GUI modeli, MCP desteği | Hazır masaüstü uygulaması deneyimi ve açık model ile yerel çalışma mümkün |
| Agent S / S2 / S3 (Simular) | Planlayıcı + "grounding" modeli ayrımı, OSWorld'de üst sıralarda | Planlama ile tıklanacak yeri bulmayı ayrı modellere bölmek doğruluğu ciddi artırıyor |
| Cua (trycua) | Sanal makine/konteyner içinde güvenli çalıştırma, SDK | Sandbox birinci sınıf özellik olmalı |
| Bytebot | Docker içinde Linux masaüstü, web arayüzü | Kendi sanal masaüstünde çalışma modu kullanıcıyı rahatlatıyor |
| Open Interpreter | Terminal/kod çalıştırarak iş yapma | Birçok görev ekran tıklamadan, kod/komutla çok daha hızlı çözülür |
| Microsoft UFO / OmniParser | Windows UI Automation + ekran ayrıştırma | Erişilebilirlik ağacı + görüntü birlikte kullanılınca tıklama hatası düşüyor |
| browser-use | Tarayıcı otomasyonu (Playwright) | Web görevleri için DOM tabanlı kontrol ekran görüntüsünden daha güvenilir |

Ortak çıkarım: en iyi sonuç tek bir yöntemden değil, **hibrit** kontrolden geliyor. Önce API/komut/DOM gibi yapısal yollar, olmazsa erişilebilirlik ağacı, en son ekran görüntüsü + fare/klavye.

Snaked'in fark yaratabileceği yerler: üç platformda eşit kalite, hibrit kontrolün iyi yapılması, ciddi bir izin/güvenlik modeli ve sevimli, güven veren bir arayüz (yılan maskotu).

## 2. Önerilen teknoloji yığını

- **Masaüstü uygulaması:** Tauri 2 (Rust çekirdek + web arayüzü). Electron'dan çok daha hafif, üç platformda paketleme, otomatik güncelleme ve sistem tepsisi hazır.
- **Arayüz:** React + TypeScript. Yüzen küçük yılan penceresi (sohbet, adım adım ne yaptığını gösteren zaman çizelgesi, durdur butonu).
- **Agent çekirdeği:** Python (ayrı bir "sidecar" süreç). Sebep: OS otomasyon kütüphaneleri, görsel modeller ve ML ekosistemi Python'da çok daha olgun. Tauri ile yerel bir WebSocket/JSON-RPC üzerinden konuşur.
- **Araç protokolü:** MCP (Model Context Protocol). Snaked'in kendi araçları (ekran, fare, dosya, terminal, tarayıcı) MCP sunucusu olarak yazılır; topluluk eklentileri de aynı yoldan gelir.

## 3. Platformlar arası kontrol katmanı

Tek bir `Computer` arayüzü, altında platform sürücüleri:

| Yetenek | macOS | Windows | Linux |
|---|---|---|---|
| Ekran görüntüsü | ScreenCaptureKit | DXGI / Windows Graphics Capture | PipeWire portal (Wayland), X11 |
| Fare/klavye | CGEvent | SendInput | libei / uinput (Wayland), XTest (X11) |
| Erişilebilirlik ağacı | AXUIElement | UI Automation | AT-SPI |
| Uygulama/pencere yönetimi | NSWorkspace, AppleScript | Win32, PowerShell | wmctrl / D-Bus |
| Komut çalıştırma | zsh | PowerShell | bash |

Başlangıçta hızlı ilerlemek için `pyautogui`/`mss`/`pynput` gibi hazır kütüphanelerle başlanır, sonra kritik kısımlar yerel API'lerle değiştirilir. **Linux Wayland en zor kısım**: kullanıcı onayı gerektiren portal'lar var, bunu baştan planlamak gerekiyor.

Eylem seçimi sırası (hibrit strateji):
1. Doğrudan araç: dosya işlemi, terminal komutu, uygulama API'si, MCP aracı.
2. Tarayıcı ise DOM üzerinden (Playwright, kullanıcının kendi tarayıcısına bağlanarak).
3. Erişilebilirlik ağacından öğe bulup tıklama.
4. Son çare: ekran görüntüsü + görsel model ile koordinat bulup fare/klavye.

## 4. Model katmanı

- **Sağlayıcıdan bağımsız arayüz:** `LLMProvider` (sohbet, araç çağırma, görüntü girdisi, akış). Altında üç tür bağlantı var:

| Bağlantı türü | Sağlayıcılar | Nasıl |
|---|---|---|
| API anahtarı | OpenAI, Anthropic, Google Gemini, Mistral, Groq, DeepSeek, xAI, OpenRouter, Azure, AWS Bedrock | LiteLLM üzerinden, 100+ sağlayıcı tek arayüzle |
| Yerel model | Ollama, LM Studio, llama.cpp, vLLM | OpenAI uyumlu uç nokta, otomatik algılama (localhost taraması) |
| Abonelik ile giriş | ChatGPT Plus/Pro, Claude Pro/Max | Aşağıdaki not |

- **Abonelikle giriş (önemli not):**
  - *ChatGPT:* v0.1'de kullanıcının kendi kurduğu ve ChatGPT hesabıyla giriş yaptığı resmi Codex CLI arka uç olarak çalıştırılır (Claude ile aynı yaklaşım, giriş bilgisi Snaked'e gelmez). Doğrudan "ChatGPT ile giriş yap" OAuth akışı daha sonra, koşullar doğrulanınca eklenebilir.
  - *Claude:* Anthropic, Claude.ai abonelik girişinin üçüncü taraf uygulamalarda kullanılmasını koşullarında kısıtlıyor. Güvenli yol: kullanıcı kendi bilgisayarında resmi Claude Code CLI'ını kendi aboneliğiyle kurmuşsa, Snaked onu bir "arka uç" olarak çalıştırır (giriş bilgisi Snaked'e hiç gelmez). Diğer durumda Claude API anahtarı kullanılır.
  - Her iki yolun da yayından önce sağlayıcıların o günkü kullanım koşullarına göre tekrar kontrol edilmesi gerekiyor; koşullar sık değişiyor. Bu kontrolü henüz yapmadım, yukarıdaki bilgi genel bilgime dayanıyor.
- **Bağlantı ekranı:** ilk açılışta "ChatGPT ile giriş", "Claude ile bağlan", "API anahtarı ekle", "Yerel model bul" kartları. Birden çok sağlayıcı aynı anda bağlı olabilir; görev başına veya rol başına (planlayıcı / grounding) model seçilir, biri hata verirse sıradakine düşülür.
- **İki rol ayrımı (Agent S dersi):**
  - *Planlayıcı:* güçlü genel model (ör. OpenAI GPT ailesi veya Claude). Görevi adımlara böler, karar verir.
  - *Grounding (yer bulucu):* "Kaydet butonu nerede?" sorusunu koordinata çeviren görsel model. Sağlayıcının kendi computer-use modu veya açık model (UI-TARS, OmniParser) kullanılabilir.
- **Kullanıcı kendi API anahtarını getirir** (BYOK), anahtarlar işletim sisteminin anahtar zincirinde saklanır. Tamamen yerel/çevrimdışı mod ileride hedef.

## 4.5 Görünüm ve deneyim

"Güzel görünmeli" hedefi için tasarım ilk günden ciddiye alınır:
- **Yılan maskotu canlı:** Rive veya Lottie animasyonu; düşünürken kıvrılır, çalışırken ekranda imleci takip eder, onay beklerken başını kaldırır, hata olunca üzgün görünür.
- **İki görünüm:** küçük yüzen "yılan balonu" (Spotlight benzeri, global kısayolla açılır) ve tam pencere (sohbet, adım zaman çizelgesi, ekran görüntüleriyle eylem geçmişi).
- **Ekran üstü katman:** agent tıklamadan önce hedefi yumuşak bir yeşil halkayla gösterir, kullanıcı ne olacağını görür.
- **Stil:** shadcn/ui + Tailwind, Framer Motion animasyonlar, açık/koyu tema, platforma uygun cam (vibrancy/mica) efektleri, Türkçe ve İngilizce arayüz.

## 5. Güvenlik ve izinler

Bilgisayarın tamamını kontrol eden bir agent için bu bölüm pazarlık konusu değil:

- **İzin seviyeleri:** "Sadece göster" (öneri yapar, kullanıcı uygular), "Her adımda sor", "Güvenli işlemlerde otomatik", "Tam otomatik". Varsayılan: her adımda sor.
- **Riskli eylem listesi:** dosya silme, para/ödeme, e-posta/mesaj gönderme, sistem ayarları, şifre alanları. Bunlar her modda ayrıca onay ister.
- **Durdurma:** her zaman görünür büyük durdur butonu + global kısayol (ör. Esc'ye iki kez basma); fare kullanıcı tarafından oynatılınca agent duraklar.
- **Sandbox modu:** isteyen kullanıcı için agent kendi sanal masaüstünde (Docker/VM, Cua ve Bytebot yaklaşımı) çalışır.
- **Prompt injection savunması:** ekranda/web'de okunan metin talimat olarak değil veri olarak ele alınır; içerikten gelen "şunu yap" istekleri onaya düşer.
- **Kayıt:** her eylemin ekran görüntülü yerel günlüğü; kullanıcı geri dönüp ne yapıldığını görebilir. Telemetri varsayılan kapalı.
- **Gizlilik:** ekran görüntüleri sadece seçilen modele gider; hassas pencereler (şifre yöneticisi vb.) için kara liste.

## 6. MVP kapsamı (v0.1)

Hedef: üç platformda kurulabilen, basit ama gerçek işleri yapan ilk sürüm.

- Tauri uygulaması + yılan sohbet penceresi + adım zaman çizelgesi + durdur butonu
- Bağlantı ekranı: API anahtarı (LiteLLM ile tüm büyük sağlayıcılar), Ollama/LM Studio otomatik algılama, Codex CLI ve Claude Code ile abonelik
- Araçlar: ekran görüntüsü, fare/klavye, terminal komutu, dosya okuma/yazma, uygulama açma
- "Her adımda sor" izin modu ve riskli eylem listesi
- Örnek görevler ile demo: "İndirilenler klasörünü türlere göre düzenle", "Şu web sitesinden tabloyu Excel'e aktar", "Spotify'ı aç ve şu şarkıyı çal"
- Basit kendi test seti (20-30 görev) ile her sürümde başarı oranı ölçümü

MVP dışında kalanlar: erişilebilirlik ağacı, tarayıcı DOM kontrolü, sandbox modu, eklenti mağazası, sesli komut.

## 7. Yol haritası

| Aşama | İçerik |
|---|---|
| 0. Hazırlık | Repo, lisans (MIT), monorepo iskeleti, CI ile üç platformda derleme |
| 1. MVP (v0.1) | Yukarıdaki kapsam |
| 2. Doğruluk (v0.2) | Erişilebilirlik ağacı sürücüleri, Playwright ile tarayıcı kontrolü, grounding modeli ayrımı, ekran üstü hedef gösterimi |
| 3. Güven (v0.3) | Sandbox modu, gelişmiş izinler, eylem günlüğü görüntüleyici, geri alma (dosya işlemlerinde) |
| 4. Ekosistem (v0.4) | MCP eklenti desteği, kaydedilebilir "beceriler" (tekrar eden görevler), zamanlanmış görevler |
| 5. Rekabet (v1.0) | OSWorld / WindowsAgentArena ölçümü ve yayınlama, sesli komut, tam yerel mod, dokümantasyon ve topluluk |

## 8. Repo yapısı önerisi

```
snaked/
  apps/desktop/        # Tauri + React arayüz
  core/agent/          # Python agent döngüsü, planlayıcı
  core/providers/      # OpenAI, Anthropic, Ollama
  core/computer/       # macos/, windows/, linux/ sürücüler
  core/tools/          # MCP araç sunucuları
  core/safety/         # izinler, riskli eylem politikası
  evals/               # görev seti ve ölçüm
  docs/
```

## 9. Verilen kararlar ve kalan tek soru

Seçilenler: Tauri 2 + React arayüz, Python agent çekirdeği, MCP araç protokolü, LiteLLM tabanlı çoklu sağlayıcı katmanı, MIT lisans.

Kalan soru: GitHub'da `Tiyatrotist/snaked` adıyla repo açıp iskeleti kurmaya başlayayım mı? (Onay gelmeden repo açılmayacak.)

## Kaynaklar

- [Star History: Computer Use, Nisan 2026](https://www.star-history.com/blog/computer-use)
- [Chakra: CUA market map](https://www.chakra.dev/publications/cua-market-map)
- [OSWorld liderlik tablosu (Codesota)](https://www.codesota.com/benchmark/osworld)
- [UI-TARS Desktop incelemesi](https://themenonlab.blog/blog/ui-tars-desktop-open-source-gui-agent)
- [Cua: açık kaynak masaüstü agentları ve Bytebot karşılaştırması](https://cua.ai/articles/open-source-desktop-agents-vs-bytebot-wins-2025)
- [macOS ve Windows için computer-use agent seçim notları 2026](https://codenote.net/en/posts/computer-use-agents-macos-windows-selection-notes-2026/)
- [Fast.io: 2026'nın en iyi computer-use agentları](https://fast.io/resources/best-computer-use-ai-agents-2026/)
