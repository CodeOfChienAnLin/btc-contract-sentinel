# BTC Contract Sentinel 比特幣合約戰術儀表板

一個駭客風格的比特幣永續合約即時監控儀表板，提供資金費率、未平倉量、多空比率、大單流向分析及 AI 戰術建議。

## 🚀 功能特色

### 核心數據監控

- **價格走勢圖** - TradingView Lightweight Charts 即時 K 線圖
- **資金費率 (Funding Rate)** - 即時費率、下次結算倒數
- **未平倉量 (Open Interest)** - 全網持倉量及變化率
- **多空比率 (Long/Short Ratio)** - 散戶及大戶持倉比例
- **大單流向** - 監控 >50 BTC 的大額成交

### AI 戰術建議

- **市場情緒指數** - -100 到 +100 的情緒量化分析
- **操作建議** - 做多/做空/觀望 + 信心度百分比
- **關鍵價位** - 24H 高低點自動標記
- **即時戰術信號** - 多頭擁擠、軋空信號、逆向指標等

### 視覺設計

- 🖥️ 駭客風 (Hacker Style) 介面
- 🌑 純黑背景 + 螢光綠/警示紅配色
- 💫 掃描線動畫、螢光效果
- 📱 PWA 響應式設計，支援手機/平板

## 📦 技術架構

```
btc_index/
├── index.html      # 主頁面 HTML
├── styles.css      # 駭客風 CSS 樣式
├── app.js          # JavaScript 應用邏輯
├── manifest.json   # PWA 配置
└── public/
    └── icons/      # PWA 圖示
```

## 🛠️ 使用方式

### 本地運行

```bash
# 進入專案目錄
cd btc_index

# 啟動本地伺服器
python3 -m http.server 8080

# 或使用其他 HTTP 伺服器
npx serve .
```

然後在瀏覽器開啟 `http://localhost:8080`

### 部署

可直接部署到任何靜態網站託管服務：

- GitHub Pages
- Netlify
- Vercel
- CloudFlare Pages

## 📡 數據來源

使用 **Binance Futures API** (免費公開 API)：

- `/fapi/v1/klines` - K 線數據
- `/fapi/v1/premiumIndex` - 資金費率
- `/fapi/v1/openInterest` - 未平倉量
- `/futures/data/globalLongShortAccountRatio` - 多空比
- `/fapi/v1/aggTrades` - 成交記錄

## ⏱️ 更新頻率

| 數據類型 | 更新間隔 |
| -------- | -------- |
| 價格/K線 | 5 秒     |
| 資金費率 | 30 秒    |
| 未平倉量 | 15 秒    |
| 多空比率 | 60 秒    |
| 大單流向 | 3 秒     |
| AI 分析  | 10 秒    |

## 🔔 戰術信號邏輯

| 條件                                 | 信號                       |
| ------------------------------------ | -------------------------- |
| Funding Rate > 0.05% + OI 激增 > 10% | ⚠️ 多頭擁擠，嚴防插針洗盤  |
| Funding Rate < -0.02% + OI 增加      | 🟢 軋空信號                |
| 大單持續賣出 + 價格 < 24h 低點       | 🔴 空頭集結，建議保守      |
| 多空比 > 2.0                         | ⚠️ 散戶過度樂觀 (逆向指標) |
| 多空比 < 0.3                         | 🟢 逆向做多機會            |
| 突破 24h 高點 + 大單買入             | 🚀 突破創高                |

## ⚠️ 免責聲明

本系統僅供參考，不構成投資建議。加密貨幣市場波動劇烈，投資有風險，請謹慎決策並自行承擔所有交易風險。

## 📄 授權

MIT License
