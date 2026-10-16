# 🤖 Shaxsiy AI Buxgalter — Telegram Ovozli Xarajatlar Nazorati Boti

Telegram orqali kundalik xarajatlarni **ovozli xabarlar** yordamida avtomatik yozib boruvchi, ularni sun'iy intellekt (Google Gemini AI) orqali tushunib kategoriyalarga ajratuvchi, oy yakunida esa **chiroyli rang-barang infografika** va **professional Excel jadval (.xlsx)** ko'rinishida hisobot taqdim etuvchi aqlli Telegram bot.

---

## ✨ Asosiy Imkoniyatlar

1. 🎙 **Ovozli xabarlarni tushunish (Voice-to-Expense):**
   - Shunchaki Telegram ovozli xabar tugmasini bosib: *"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"* deb yuborasiz.
   - Bot o'zbek tilidagi nutqni aniq eshitib, qancha pul va nima uchun sarflanganini bir zumda aniqlaydi.

2. 🧠 **Sun'iy Intellekt (Google Gemini AI):**
   - O'zbek tilidagi so'zlashuv iboralarini tushunadi (*"25 ming"*, *"1.5 million"*, *"yarim million"*, *"dorixonadan dori oldim"*).
   - "Bugun", "kecha", "o'tgan kun" kabi sanalarni to'g'ri bog'laydi.
   - Xarajat bo'lmagan oddiy suhbatlarni xarajat deb hisoblamaydi.

3. 📂 **Aqlli Kategoriyalash:**
   - 🚕 **Transport** (taksi, metro, benzin, metan, avtobus)
   - 🍔 **Oziq-ovqat va Kafe** (tushlik, kechki ovqat, kofe, fastfud)
   - 🛒 **Bozor va Supermarket** (bozorlik, go'sht, sabzavot, supermarket)
   - 💡 **Kommunal va Aloqa** (svet, gaz, suv, internet, telefon balansi)
   - 💊 **Salomatlik va Dorixona** (dori-darmon, shifokor, klinika)
   - 🛍 **Kiyim va Xaridlar** (kiyim, poyabzal, texnika)
   - 🎓 **Ta'lim va Kitoblar** (kurslar, kitob, repetitor)
   - 🎮 **Hordiq va O'yin-kulgi** (kino, dam olish, sayohat)
   - 🎁 **Ehson va Sovg'alar** (sadaqa, to'yona, sovg'a)
   - 🏠 **Uy va Ro'zg'or** (uy ta'miri, maishiy buyumlar)
   - 📦 **Boshqa xarajatlar**

4. 📈 **Chiroyli Infografika:**
   - Har oy yakunida (yoki istalgan vaqt tugmani bosganda) kategoriyalar ulushini ko'rsatuvchi yuqori sifatli rang-barang **Doughnut / Pie diagramma** rasm ko'rinishida yuboriladi.

5. 📥 **Executive Excel (.xlsx) Hisoboti:**
   - Barcha xarajatlar ro'yxati, sanalari, kiritish usuli (ovoz / matn).
   - Kategoriyalar tahlili, foizlar, formulalar va chiroyli dizayn bilan formatlangan 2 ta ishchi sahifa.

6. ⚡️ **Tezkor va Xavfsiz SQLite Bazasi:**
   - Hech qanday murakkab server talab qilmaydi, Node.js ning o'rnatilgan `node:sqlite` bazasi orqali ma'lumotlar kompyuteringizda xavfsiz saqlanadi.

7. 💡 **AI Moliyaviy Maslahatchi:**
   - Menyudagi "💡 AI Maslahatchi" tugmasi orqali sun'iy intellekt xarajatlaringizni chuqur tahlil qilib, qayerda ortiqcha xarajat qilayotganingizni aniqlaydi va shaxsiy tejash sirlarini ulashadi.

8. 🔮 **Kelajak prognozi (Forecasting):**
   - Hozirgi kunlik xarajat tezligingiz asosida oy oxirigacha qancha pul sarflashingizni oldindan hisoblab beradi.

9. 🎯 **Oylik byudjet va limit nazorati:**
   - Oylik byudjetingizni belgilashingiz mumkin (masalan, 5 000 000 so'm). Limitning 80% yoki 100% qismi sarflanganda AI ogohlantirish yuboradi.

10. 🗑 **Oxirgisini bekor qilish (Undo):**
   - Agar adashib kiritgan bo'lsangiz, tasdiqlovchi xabar ostidagi **"Bekor qilish"** tugmasi orqali o'chirib tashlash imkoniyati.

---

## 🚀 O'rnatish va Ishga Tushirish

### 1-qadam: Bot Tokenini Olish
1. Telegramda [@BotFather](https://t.me/BotFather) ga kiring.
2. `/newbot` buyrug'ini yuboring.
3. Botingizga nom va username bering.
4. `@BotFather` sizga bergan **HTTP API Token**ni nusxalab oling.

### 2-qadam: Bepul Gemini API Kalitini Olish
1. [Google AI Studio](https://aistudio.google.com/app/apikey) sahifasiga kiring.
2. Google hisobingiz bilan kiring va **"Create API key"** tugmasini bosing.
3. Chiqqan kalitni nusxalab oling.

### 3-qadam: `.env` Faylini Sozlash
Loyiha papkasidagi `.env` faylini oching va kalitlaringizni kiriting:

```env
BOT_TOKEN=bu_yerga_botfather_tokeni
GEMINI_API_KEY=bu_yerga_gemini_api_kaliti
GEMINI_MODEL=gemini-2.0-flash
```

### 4-qadam: Botni Ishga Tushirish
Terminal (PowerShell) orqali loyiha papkasida quyidagi buyruqni bering:

```bash
npm start
```

*(Dasturchilar uchun avtomatik qayta ishga tushuvchi rejim: `npm run dev`)*

---

## 💬 Foydalanish Bo'yicha Namunalar

Telegramda botingizga kiring, `/start` ni bosing va sinab ko'ring:

- 🎙 **Ovozli xabar:**
  > *"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"*
- 🎙 **Yana bir ovoz:**
  > *"Kecha bozordan 180 mingga go'sht oldim, dorixonaga 35 ming ketdi"*
- ✍️ **Matnli xabar:**
  > *"Mashinaga 120 ming benzin quydim"*
  > *"Kofega 22000, kitobga 75000"*

Bot bir necha soniyada xabarni tahlil qilib, jami hisob-kitobni chiqarib beradi!

---

## 📁 Loyiha Strukturasi

```
telegram-bot/
├── package.json               # Bog'liqliklar va buyruqlar
├── .env.example               # Muhit o'zgaruvchilari namunasi
├── .env                       # Shaxsiy tokenlar fayli
├── README.md                  # Ushbu qo'llanma
│
├── data/                      # Baza va eksportlar
│   ├── expenses.db            # SQLite ma'lumotlar bazasi
│   └── exports/               # Yaratilgan Excel fayllar
│
└── src/
    ├── index.js               # Asosiy ishga tushiruvchi fayl
    ├── config.js              # Sozlamalar va muhit
    ├── database/
    │   └── db.js              # SQLite operatsiyalari (CRUD)
    ├── services/
    │   ├── aiService.js       # Google Gemini AI integratsiyasi
    │   ├── chartService.js    # QuickChart infografika generatsiyasi
    │   └── excelService.js    # ExcelJS orqali chiroyli hisobotlar
    ├── handlers/
    │   ├── voiceHandler.js    # Ovozli xabarlarni qabul qilish
    │   ├── textHandler.js     # Matnli xabarlar va buyruqlar
    │   ├── reportHandler.js   # Infografika, Excel va oylik hisobotlar
    │   └── actionHandler.js   # Bekor qilish va navigatsiya tugmalari
    └── utils/
        ├── categories.js      # Kategoriyalar, ranglar va emojilar
        ├── formatters.js      # So'm valyutasi va o'zbekcha sanalar
        └── keyboards.js       # Telegram menyu va inline tugmalari
```

---

## 🛠 Texnologiyalar

- **Runtime:** Node.js (v22+)
- **Telegram Framework:** [GrammY](https://grammy.dev/)
- **Sun'iy Intellekt:** Google Gemini AI (Multimodal Audio & Text)
- **Ma'lumotlar bazasi:** O'rnatilgan SQLite (`node:sqlite`)
- **Infografika:** QuickChart API & Chart.js
- **Excel Eksport:** ExcelJS
