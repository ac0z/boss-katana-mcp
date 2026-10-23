# KATANA Gen 1 — kullanıcı komutlarıyla MCP deneme günlüğü

Bu günlük yalnız kullanıcının buradan verdiği komutları ve bunların sonuçlarını
kaydeder. Önceden asistanın kendiliğinden çalıştırdığı testler, kullanıcıyla
birlikte yapılmış komut denemeleri olarak değerlendirilmez.

## Oturum kuralları

- Kullanıcı komutu olmadan ek test veya cihaz işlemi başlatılmaz.
- Cihaza yazma, patch save ve firmware işlemleri ayrıca açık onay gerektirir.
- Yazma onayı, adaptörün desteklemediği bir işlemi desteklenir hale getirmez.
- Her kayıtta istek, gerçekten yapılan çağrılar, sonuç ve kapsam ayrılır.
- Kayıtlı sonuçlar başka model veya firmware için çalışma garantisi değildir.

## 1. Metal tonu isteği

- Zaman: 2026-10-23 21:32 (Europe/Istanbul).
- Kullanıcı komutu: **“bana metal tonu ver”**.
- Hedef: BOSS KATANA-50 Gen 1; mevcut yerel Gen 1 MIDI adaptörü.
- Sonuç: **UYGULANMADI — mevcut adaptör tam ton yazmasını desteklemiyor.**
- Fiziksel MCP/MIDI çağrısı: **Yok**. Bağlantı, okuma veya ek test başlatılmadı.
- Cihaza yazma / patch save / firmware işlemi: **Yok**.
- Yapılan yerel işlem: `src/gen1/parameters.ts` içindeki yazma izinleri incelendi.

Metal tonu uygulamak amfi türü, Gain, EQ ve/veya efekt ayarlarında yazma
gerektirir. Mevcut Gen 1 adaptöründe bu genel yazma yolu yoktur. Yalnız
`TemporaryGain` için ham 95/96 değerlerine sınırlı deneysel yazma altyapısı vardır;
bu, metal tonu kurma desteği değildir. Volume/EQ/efekt yazmaları salt okunur
politika nedeniyle engellenir. Kullanıcıdan bu komut için ayrıca yazma onayı
alınmadı; desteklenmeyen bir işlem için onay istenmedi.

Bu sonuç cihazdan alınmış bir MCP hata yanıtı değildir; çağrı yapılmadan önce
kaynak kodundaki yetenek sınırından saptanmıştır. Metal tonu cihazda kurulmuş
veya denenmiş olarak raporlanamaz.

## 2. Metal tonu desteği ve açık yazma onayı

- Kullanıcı komutu: **“destegi getir. yazma onayını veriyorum”**.
- Fiziksel koşul yanıtı: **“Evet, fiziksel MASTER düşük”**.
- Yetkilendirilen iş: Gen 1 geçici ton yazma desteğini geliştirmek ve istenen metal
  başlangıç tonunu uygulamak. Patch save / firmware yetkisi verilmedi.
- Kaynak araştırması: Kurulu Tone Studio 4.0.0 adres haritası ve SWF içindeki
  `preamp_a_gain`, EQ, LEVEL, NS1 Threshold tanımları salt okunur incelendi.
  Gain 0..120, EQ/Presence/LEVEL ve NS1 Threshold 0..100 statik aralıkları
  sabit dosya hash'leri ve FWS ofsetleriyle bağımsız doğrulandı.
- Yeni araç: `katana_gen1_apply_tone`; varsayılan `dryRun=true`, sıfır MIDI I/O.
- Tone Studio açık bulundu; otomatik kapatılmadı. Kullanıcı daha sonra
  **“Tone Studio’yu kapattım”** yanıtını verdi; süreç listesi kapanmayı doğruladı.
- Fiziksel uygulama: **PASS — 2026-10-23 21:48:39–21:48:41 Europe/Istanbul**.
- Cihaza yazma: **9 geçici DT1**, 8 ayrı adres; LEVEL iki kez yazıldı.
- Patch save / firmware: **Yok**.

Planlanan ham DSP değerleri: TemporaryAmpType 23 (SLDN/Brown; panel kodu 4 ile
karıştırılmaz), Gain 85, Bass 60, Middle 40, Treble 65, Presence 45;
Booster/Mod/FX/Delay/Reverb OFF; NS1 ON, Threshold 55. TemporaryLevel önce 0,
sonunda `min(önceki LEVEL, 5)`; yazılabilir genel yazılım tavanı 10.
Bu seviyeler akustik ses şiddeti garantisi değildir; fiziksel MASTER düşük kalır.

Gerçek SDK/MCP stdio çağrıları, sırasıyla:

1. `katana_gen1_status` — yazma kapıları bu tek süreçte açık, henüz bağlı değil.
2. `katana_gen1_apply_tone {name:"metal"}` — varsayılan dryRun, sıfır MIDI I/O.
3. `katana_gen1_discover` — tek KATANA input/output çifti bulundu.
4. `katana_gen1_connect` — Roland kimliği eşleşti; firmware bilinmiyor.
5. `katana_gen1_apply_tone {name:"metal",outputLevel:5,dryRun:false}` — PASS.
6. `katana_gen1_disconnect` — temiz kapanış; kilit/cleanup hatası yok.

| Ham etkin alan | Önce | Sonra |
| --- | ---: | ---: |
| TemporaryAmpType | 1 | 23 |
| TemporaryGain | 54 | 85 |
| TemporaryBass | 54 | 60 |
| TemporaryMiddle | 58 | 40 |
| TemporaryTreble | 46 | 65 |
| TemporaryPresence | 16 | 45 |
| BoosterOn / ModOn / FxOn / DelayOn / ReverbOn | Hepsi 0 | Hepsi 0; DT1 atlandı |
| NoiseSuppressorOn | 1 | 1; DT1 atlandı |
| NoiseSuppressorThreshold | 47 | 55 |
| TemporaryLevel | 28 | Önce 0, sonunda 5 |

Bir kimlik sorgusu, 70 RQ1, 9 DT1 gönderildi; 71 RX alındı. Guard tarafından
engellenen gönderim yok. Her hedef geri okumayla doğrulandı. Ses kaydı/dinleme,
güç döngüsü, farklı firmware, sök-tak veya ek donanım testi yapılmadı. Ton geçici
durumda bırakıldı; kalıcı patch kaydı yapılmadı. Yazma onayı, gelecekte kullanıcının
komut vermediği ek testleri kendiliğinden başlatmak için kullanılmayacak.

Kanıtlar: `boss-katana-mcp/docs/evidence/gen1-metal-2026-10-23/`.
Bağımsız salt okunur doğrulama: `python scripts/Verify-Gen1MetalEvidence.py` PASS.
Audit SHA-256: `839070b752665da3a12c4e6be77bc02423b1ef46634130ec7a79db1bfa301bf8`.
Ayrıntılı rapor: `boss-katana-mcp/docs/gen1-hardware-metal-2026-10-23.md`.
