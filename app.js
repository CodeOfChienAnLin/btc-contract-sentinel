// ========== 配置常數 ==========
const CONFIG = {
  // API 端點
  BINANCE_BASE: "https://fapi.binance.com",
  SYMBOL: "BTCUSDT",

  // 更新間隔（毫秒）- 高頻刷新
  // 更新間隔（毫秒）- 高頻刷新
  INTERVALS: {
    PRICE: 1000, // 價格：1秒 (更即時)
    CHART: 3000, // 圖表：3秒
    FUNDING: 30000,
    OI: 10000, // 未平倉量：10秒
    LONG_SHORT: 30000, // 多空比：30秒
    ORDER_FLOW: 2000, // 大單流向：2秒
  },

  // 閾值設定
  THRESHOLDS: {
    FUNDING: {
      EXTREME_POSITIVE: 0.001,
      HIGH_POSITIVE: 0.0005,
      POSITIVE: 0.0001,
      NEGATIVE: -0.0001,
      HIGH_NEGATIVE: -0.0005,
      EXTREME_NEGATIVE: -0.001,
    },
    OI_CHANGE: {
      SPIKE: 10,
      INCREASE: 5,
      DECREASE: -5,
      DUMP: -10,
    },
    LONG_SHORT: {
      EXTREME_LONG: 2.0,
      BULLISH: 1.5,
      BEARISH: 0.5,
      EXTREME_SHORT: 0.3,
    },
    LARGE_ORDER: 50, // BTC
  },
};

// ========== 狀態管理 ==========
const state = {
  chart: null,
  candleSeries: null,
  volumeSeries: null,
  currentTimeframe: "1h",
  lastCandle: null, // 新增：保存最後一根 K 棒數據

  // 市場數據
  price: { current: 0, change: 0, changePercent: 0, high24h: 0, low24h: 0 },
  funding: { rate: 0, nextTime: 0, markPrice: 0, indexPrice: 0 },
  oi: { current: 0, previous: 0, changePercent: 0 },
  longShort: { ratio: 0, longPercent: 0, shortPercent: 0, topRatio: 0 },
  orderFlow: {
    buyVolume: 0,
    sellVolume: 0,
    buyCount: 0,
    sellCount: 0,
    delta: 0,
    largeTrades: [],
  },

  // AI 分析
  analysis: {
    sentimentScore: 0,
    signals: [],
    recommendation: { action: "wait", confidence: 0, reason: "" },
  },
};

// ========== 工具函數 ==========
function formatNumber(num, decimals = 2) {
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(decimals) + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(decimals) + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(decimals) + "K";
  return num.toFixed(decimals);
}

function formatPrice(price) {
  return (
    "$" +
    price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatPercent(value, decimals = 4) {
  return (value >= 0 ? "+" : "") + (value * 100).toFixed(decimals) + "%";
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getTimeToFunding(nextTime) {
  const diff = nextTime - Date.now();
  if (diff <= 0) return "即將結算";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// ========== API 調用 ==========
async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`${CONFIG.BINANCE_BASE}${endpoint}`);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("API Fetch Error:", error);
    return null;
  }
}

// 獲取 K 線數據
async function fetchKlines(interval = "1h", limit = 200) {
  const data = await fetchAPI(
    `/fapi/v1/klines?symbol=${CONFIG.SYMBOL}&interval=${interval}&limit=${limit}`,
  );
  if (!data) return [];

  return data.map((item) => ({
    time: Math.floor(item[0] / 1000),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
  }));
}

// 獲取 24h 行情
async function fetch24hTicker() {
  const data = await fetchAPI(`/fapi/v1/ticker/24hr?symbol=${CONFIG.SYMBOL}`);
  if (!data) return null;

  return {
    lastPrice: parseFloat(data.lastPrice),
    priceChange: parseFloat(data.priceChange),
    priceChangePercent: parseFloat(data.priceChangePercent),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
  };
}

// 獲取資金費率
async function fetchFundingRate() {
  const data = await fetchAPI(`/fapi/v1/premiumIndex?symbol=${CONFIG.SYMBOL}`);
  if (!data) return null;

  return {
    lastFundingRate: parseFloat(data.lastFundingRate),
    nextFundingTime: data.nextFundingTime,
    markPrice: parseFloat(data.markPrice),
    indexPrice: parseFloat(data.indexPrice),
  };
}

// 獲取未平倉量
async function fetchOpenInterest() {
  const data = await fetchAPI(`/fapi/v1/openInterest?symbol=${CONFIG.SYMBOL}`);
  if (!data) return null;

  return parseFloat(data.openInterest);
}

// 獲取多空比
async function fetchLongShortRatio() {
  const [globalData, topData] = await Promise.all([
    fetchAPI(
      `/futures/data/globalLongShortAccountRatio?symbol=${CONFIG.SYMBOL}&period=5m&limit=1`,
    ),
    fetchAPI(
      `/futures/data/topLongShortAccountRatio?symbol=${CONFIG.SYMBOL}&period=5m&limit=1`,
    ),
  ]);

  if (!globalData || !globalData[0]) return null;

  const global = globalData[0];
  return {
    ratio: parseFloat(global.longShortRatio),
    longAccount: parseFloat(global.longAccount),
    shortAccount: parseFloat(global.shortAccount),
    topRatio:
      topData && topData[0] ? parseFloat(topData[0].longShortRatio) : null,
  };
}

// 獲取成交記錄
async function fetchRecentTrades() {
  const data = await fetchAPI(
    `/fapi/v1/aggTrades?symbol=${CONFIG.SYMBOL}&limit=500`,
  );
  if (!data) return [];

  return data.map((trade) => ({
    time: trade.T,
    price: parseFloat(trade.p),
    quantity: parseFloat(trade.q),
    isSell: trade.m,
  }));
}

// ========== 圖表初始化 ==========
function initChart() {
  const container = document.getElementById("priceChart");
  if (!container) return;

  state.chart = LightweightCharts.createChart(container, {
    layout: {
      background: { color: "#0a0a0f" },
      textColor: "#4ade80",
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: "#1e1e2e" },
      horzLines: { color: "#1e1e2e" },
    },
    crosshair: {
      vertLine: { color: "#4ade80", width: 1, style: 2 },
      horzLine: { color: "#4ade80", width: 1, style: 2 },
    },
    rightPriceScale: {
      borderColor: "#1e1e2e",
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: "#1e1e2e",
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // K 線系列 - 柔和配色
  state.candleSeries = state.chart.addCandlestickSeries({
    upColor: "#4ade80",
    downColor: "#f87171",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#4ade80",
    wickDownColor: "#f87171",
  });

  // 成交量系列
  state.volumeSeries = state.chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  });

  state.chart.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  // 響應式調整
  const resizeObserver = new ResizeObserver(() => {
    state.chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight || 350,
    });
  });
  resizeObserver.observe(container);

  // 時間框架按鈕
  document.querySelectorAll(".tf-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelectorAll(".tf-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTimeframe = btn.dataset.tf;
      await updateChart();
    });
  });
}

// 更新圖表
async function updateChart() {
  const klines = await fetchKlines(state.currentTimeframe);
  if (!klines.length) return;

  // 更新 K 線
  const candleData = klines.map((k) => ({
    time: k.time,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  }));
  state.candleSeries.setData(candleData);

  // 保存最後一根 K 棒，供 updatePrice 即時更新使用
  if (candleData.length > 0) {
    state.lastCandle = { ...candleData[candleData.length - 1] };
  }

  // 更新成交量 - 柔和配色
  const volumeData = klines.map((k) => ({
    time: k.time,
    value: k.volume,
    color:
      k.close >= k.open
        ? "rgba(74, 222, 128, 0.35)"
        : "rgba(248, 113, 113, 0.35)",
  }));
  state.volumeSeries.setData(volumeData);

  // 添加價位線 - 柔和配色
  if (state.price.high24h > 0) {
    state.candleSeries.createPriceLine({
      price: state.price.high24h,
      color: "#4ade80",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "24H HIGH",
    });
  }

  if (state.price.low24h > 0) {
    state.candleSeries.createPriceLine({
      price: state.price.low24h,
      color: "#f87171",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "24H LOW",
    });
  }

  state.chart.timeScale().scrollToRealTime();
}

// ========== UI 更新函數 ==========
function updatePriceUI() {
  const { current, change, changePercent, high24h, low24h } = state.price;

  // 頁首價格
  const priceEl = document.getElementById("currentPrice");
  priceEl.textContent = formatPrice(current);
  priceEl.className = "price-value " + (change >= 0 ? "positive" : "negative");

  // 價格變化
  const changeEl = document.getElementById("priceChange");
  changeEl.className =
    "price-change " + (change >= 0 ? "positive" : "negative");
  changeEl.querySelector(".change-percent").textContent =
    (change >= 0 ? "▲ +" : "▼ ") + changePercent.toFixed(2) + "%";
  changeEl.querySelector(".change-value").textContent =
    (change >= 0 ? "+" : "") + formatPrice(change);

  // 關鍵價位
  document.getElementById("high24h").textContent = formatPrice(high24h);
  document.getElementById("low24h").textContent = formatPrice(low24h);
  document.getElementById("currentPriceLevel").textContent =
    formatPrice(current);

  // 價格位置指示器
  if (high24h > low24h) {
    const position = ((current - low24h) / (high24h - low24h)) * 100;
    document.getElementById("pricePositionFill").style.width =
      Math.max(0, Math.min(100, position)) + "%";
    document.getElementById("pricePositionDot").style.left =
      Math.max(0, Math.min(100, position)) + "%";
  }
}

function updateFundingUI() {
  const { rate, markPrice, indexPrice, nextTime } = state.funding;
  const T = CONFIG.THRESHOLDS.FUNDING;

  // 資金費率值
  const rateEl = document.getElementById("fundingRate");
  rateEl.textContent = formatPercent(rate);

  // 決定狀態和顏色
  let status, statusClass;
  if (rate >= T.EXTREME_POSITIVE) {
    status = "極度過熱";
    statusClass = "bearish";
    rateEl.className = "metric-value positive";
  } else if (rate >= T.HIGH_POSITIVE) {
    status = "過熱";
    statusClass = "warning";
    rateEl.className = "metric-value positive";
  } else if (rate >= T.POSITIVE) {
    status = "偏多";
    statusClass = "bullish";
    rateEl.className = "metric-value positive";
  } else if (rate <= T.EXTREME_NEGATIVE) {
    status = "極度恐慌";
    statusClass = "bullish";
    rateEl.className = "metric-value negative";
  } else if (rate <= T.HIGH_NEGATIVE) {
    status = "恐慌";
    statusClass = "warning";
    rateEl.className = "metric-value negative";
  } else if (rate <= T.NEGATIVE) {
    status = "偏空";
    statusClass = "bearish";
    rateEl.className = "metric-value negative";
  } else {
    status = "中性";
    statusClass = "neutral";
    rateEl.className = "metric-value neutral";
  }

  document.getElementById("fundingStatus").textContent = status;
  document.getElementById("fundingStatus").className =
    "status-badge " + statusClass;

  // 其他資訊
  document.getElementById("markPrice").textContent = formatPrice(markPrice);
  document.getElementById("indexPrice").textContent = formatPrice(indexPrice);

  // 分析文字
  document.getElementById("fundingAnalysis").textContent =
    `當前資金費率 ${formatPercent(rate)}，${rate > 0 ? "多頭支付費用給空頭" : rate < 0 ? "空頭支付費用給多頭" : "多空平衡"}`;
}

function updateFundingCountdown() {
  const { nextTime } = state.funding;
  if (nextTime > 0) {
    document.getElementById("fundingCountdown").textContent =
      getTimeToFunding(nextTime);
  }
}

function updateOIUI() {
  const { current, previous, changePercent } = state.oi;
  const T = CONFIG.THRESHOLDS.OI_CHANGE;

  document.getElementById("openInterest").textContent =
    formatNumber(current) + " BTC";

  const changeEl = document.getElementById("oiChange");
  changeEl.textContent =
    (changePercent >= 0 ? "+" : "") + changePercent.toFixed(2) + "%";
  changeEl.className =
    "value " + (changePercent >= 0 ? "positive" : "negative");

  // 狀態
  let status, statusClass;
  if (changePercent >= T.SPIKE) {
    status = "激增";
    statusClass = "warning";
  } else if (changePercent >= T.INCREASE) {
    status = "增加";
    statusClass = "bullish";
  } else if (changePercent <= T.DUMP) {
    status = "暴跌";
    statusClass = "warning";
  } else if (changePercent <= T.DECREASE) {
    status = "減少";
    statusClass = "bearish";
  } else {
    status = "穩定";
    statusClass = "neutral";
  }

  document.getElementById("oiStatus").textContent = status;
  document.getElementById("oiStatus").className = "status-badge " + statusClass;

  // 進度條
  const progressWidth = Math.min(Math.abs(changePercent) * 5, 100);
  const progressEl = document.getElementById("oiProgress");
  progressEl.style.width = progressWidth + "%";
  progressEl.style.background =
    changePercent >= 0
      ? "linear-gradient(90deg, var(--color-success), transparent)"
      : "linear-gradient(90deg, var(--color-danger), transparent)";

  // 分析
  document.getElementById("oiAnalysis").textContent =
    `未平倉量變化 ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%，${
      changePercent > 5
        ? "大量資金進場"
        : changePercent < -5
          ? "資金流出明顯"
          : "維持穩定"
    }`;
}

function updateLongShortUI() {
  const { ratio, longPercent, shortPercent, topRatio } = state.longShort;
  const T = CONFIG.THRESHOLDS.LONG_SHORT;

  // 計算百分比（API 返回的是比率，需要轉換）
  const longPct = (ratio / (ratio + 1)) * 100;
  const shortPct = (1 / (ratio + 1)) * 100;

  document.getElementById("longPercent").textContent = longPct.toFixed(1) + "%";
  document.getElementById("shortPercent").textContent =
    shortPct.toFixed(1) + "%";
  document.getElementById("lsRatio").textContent = ratio.toFixed(2);

  if (topRatio !== null) {
    const topEl = document.getElementById("topTraderRatio");
    topEl.textContent = topRatio.toFixed(2);
    topEl.className = "value " + (topRatio >= 1 ? "positive" : "negative");
  }

  // 狀態
  let status, statusClass;
  if (ratio >= T.EXTREME_LONG) {
    status = "極度偏多";
    statusClass = "warning";
  } else if (ratio >= T.BULLISH) {
    status = "偏多";
    statusClass = "neutral";
  } else if (ratio <= T.EXTREME_SHORT) {
    status = "極度偏空";
    statusClass = "warning";
  } else if (ratio <= T.BEARISH) {
    status = "偏空";
    statusClass = "neutral";
  } else {
    status = "中性";
    statusClass = "neutral";
  }

  document.getElementById("lsStatus").textContent = status;
  document.getElementById("lsStatus").className = "status-badge " + statusClass;

  // 視覺條
  document.getElementById("lsBarLong").style.width = longPercent + "%";
  document.getElementById("lsBarShort").style.width = shortPercent + "%";

  // 分析
  const isContrarian = ratio >= T.EXTREME_LONG || ratio <= T.EXTREME_SHORT;
  document.getElementById("lsAnalysis").textContent =
    `多空比 ${ratio.toFixed(2)}，${
      isContrarian ? "⚠️ 觸發逆向指標，需警惕反向行情" : "市場情緒正常"
    }`;
}

function updateOrderFlowUI() {
  const { buyVolume, sellVolume, buyCount, sellCount, delta, largeTrades } =
    state.orderFlow;

  document.getElementById("buyVolume").textContent =
    "$" + formatNumber(buyVolume);
  document.getElementById("sellVolume").textContent =
    "$" + formatNumber(sellVolume);
  document.getElementById("buyCount").textContent = buyCount + " 筆";
  document.getElementById("sellCount").textContent = sellCount + " 筆";

  const deltaEl = document.getElementById("flowDelta");
  deltaEl.textContent = (delta >= 0 ? "+" : "") + "$" + formatNumber(delta);
  deltaEl.className = "value " + (delta >= 0 ? "positive" : "negative");

  // 狀態
  let status, statusClass;
  const absStrength = (Math.abs(delta) / (buyVolume + sellVolume || 1)) * 100;
  if (absStrength > 20) {
    status = delta > 0 ? "買盤主導" : "賣盤主導";
    statusClass = delta > 0 ? "bullish" : "bearish";
  } else {
    status = "均衡";
    statusClass = "neutral";
  }

  document.getElementById("orderFlowStatus").textContent = status;
  document.getElementById("orderFlowStatus").className =
    "status-badge " + statusClass;

  // 大單列表
  const tbody = document.getElementById("tradesBody");
  if (largeTrades.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="no-data">暫無大單成交</td></tr>';
  } else {
    tbody.innerHTML = largeTrades
      .slice(0, 10)
      .map(
        (trade) => `
            <tr class="${trade.isSell ? "sell-row" : "buy-row"}">
                <td>${formatTime(trade.time)}</td>
                <td style="font-weight:bold">${trade.isSell ? "賣出" : "買入"}</td>
                <td>${trade.quantity.toFixed(2)} BTC</td>
                <td>${formatPrice(trade.price)}</td>
            </tr>
        `,
      )
      .join("");
  }
}

function updateTacticalUI() {
  const { sentimentScore, signals, recommendation } = state.analysis;

  // 情緒儀表
  const gaugeRing = document.getElementById("sentimentRing");
  const scoreEl = document.getElementById("sentimentScore");
  const labelEl = document.getElementById("sentimentLabel");

  scoreEl.textContent = (sentimentScore > 0 ? "+" : "") + sentimentScore;

  let sentiment, color;
  if (sentimentScore >= 50) {
    sentiment = "看多";
    color = "#4ade80";
  } else if (sentimentScore >= 20) {
    sentiment = "偏多";
    color = "rgba(74, 222, 128, 0.8)";
  } else if (sentimentScore <= -50) {
    sentiment = "看空";
    color = "#f87171";
  } else if (sentimentScore <= -20) {
    sentiment = "偏空";
    color = "rgba(248, 113, 113, 0.8)";
  } else {
    sentiment = "中性";
    color = "#fbbf24";
  }

  labelEl.textContent = sentiment;
  scoreEl.style.color = color;
  gaugeRing.style.background = `conic-gradient(${color} ${(sentimentScore + 100) / 2}%, #151520 0%)`;
  gaugeRing.style.boxShadow = `0 0 15px ${color}`;

  // 操作建議
  const recSection = document.getElementById("recommendationSection");
  recSection.className =
    "tactical-section recommendation-section " + recommendation.action;

  const icons = { long: "📈", short: "📉", wait: "⏸️" };
  const actions = { long: "做多", short: "做空", wait: "觀望" };

  document.getElementById("recIcon").textContent = icons[recommendation.action];
  document.getElementById("recAction").textContent =
    actions[recommendation.action];
  document.getElementById("recConfidence").textContent =
    recommendation.confidence.toFixed(0);
  document.getElementById("recReason").textContent = recommendation.reason;

  // 戰術信號
  const signalsList = document.getElementById("signalsList");
  if (signals.length === 0) {
    signalsList.innerHTML = `
            <div class="signal-item neutral">
                <div class="signal-content">
                    <span class="signal-title">📊 市場平靜</span>
                    <span class="signal-badge low">低</span>
                </div>
                <p class="signal-desc">目前無特殊信號，市場運行正常</p>
            </div>
        `;
  } else {
    signalsList.innerHTML = signals
      .map(
        (signal) => `
            <div class="signal-item ${signal.type}">
                <div class="signal-content">
                    <span class="signal-title">${signal.title}</span>
                    <span class="signal-badge ${signal.severity === 3 ? "high" : signal.severity === 2 ? "medium" : "low"}">
                        ${signal.severity === 3 ? "高" : signal.severity === 2 ? "中" : "低"}
                    </span>
                </div>
                <p class="signal-desc">${signal.description}</p>
                <p class="signal-time">${formatTime(signal.timestamp)}</p>
            </div>
        `,
      )
      .join("");
  }
}

// ========== 分析邏輯 ==========
function runAnalysis() {
  const signals = [];
  const now = Date.now();
  const T = CONFIG.THRESHOLDS;

  const { rate } = state.funding;
  const { changePercent: oiChange } = state.oi;
  const { ratio: lsRatio } = state.longShort;
  const { delta: flowDelta } = state.orderFlow;
  const {
    current: price,
    low24h,
    high24h,
    changePercent: priceChange,
  } = state.price;

  // 條件1: 資金費率暴增 + OI 暴增
  if (rate > T.FUNDING.HIGH_POSITIVE && oiChange > T.OI_CHANGE.SPIKE) {
    signals.push({
      type: "warning",
      title: "⚠️ 多頭擁擠警告",
      description: "資金費率與未平倉量同時激增，多頭過度擁擠，嚴防插針洗盤",
      timestamp: now,
      severity: 3,
    });
  }

  // 條件2: 大單持續賣出 + 價格接近低點
  if (flowDelta < -1000000 && price < low24h * 1.01) {
    signals.push({
      type: "bearish",
      title: "🔴 空頭集結",
      description: "大單持續流出且價格接近24h低點，空頭力量強勢，建議保守",
      timestamp: now,
      severity: 3,
    });
  }

  // 條件3: 負費率 + OI 增加
  if (rate < T.FUNDING.HIGH_NEGATIVE && oiChange > T.OI_CHANGE.INCREASE) {
    signals.push({
      type: "bullish",
      title: "🟢 軋空信號",
      description: "負費率配合持倉增加，空頭積累中，可能出現軋空行情",
      timestamp: now,
      severity: 2,
    });
  }

  // 條件4: 多空比極端偏多
  if (lsRatio > T.LONG_SHORT.EXTREME_LONG) {
    signals.push({
      type: "warning",
      title: "⚠️ 散戶過度樂觀",
      description: `多空比達 ${lsRatio.toFixed(2)}，散戶做多情緒過熱，注意反向風險`,
      timestamp: now,
      severity: 2,
    });
  }

  // 條件5: 多空比極端偏空
  if (lsRatio < T.LONG_SHORT.EXTREME_SHORT) {
    signals.push({
      type: "bullish",
      title: "🟢 逆向做多機會",
      description: `多空比僅 ${lsRatio.toFixed(2)}，市場恐慌，可能存在超賣反彈機會`,
      timestamp: now,
      severity: 2,
    });
  }

  // 條件6: 突破24h高點
  if (price > high24h && flowDelta > 500000) {
    signals.push({
      type: "bullish",
      title: "🚀 突破創高",
      description: "價格突破24h高點且有大單買入支撐，關注回踩確認",
      timestamp: now,
      severity: 2,
    });
  }

  // 計算情緒分數
  let score = 0;
  score += Math.max(Math.min(rate * 100 * 30, 30), -30);
  score += Math.max(Math.min(oiChange * 2, 20), -20);
  score += Math.max(Math.min((lsRatio - 1) * 20, 20), -20);
  score += Math.max(Math.min((flowDelta / 10000000) * 15, 15), -15);
  score += Math.max(Math.min(priceChange * 3, 15), -15);
  score = Math.max(Math.min(Math.round(score), 100), -100);

  // 生成建議
  const hasHighWarning = signals.some(
    (s) => s.severity === 3 && s.type === "warning",
  );
  let recommendation;

  if (hasHighWarning) {
    recommendation = {
      action: "wait",
      confidence: 80,
      reason: "市場存在高風險信號，建議暫時觀望等待明確方向",
    };
  } else if (score >= 50) {
    recommendation = {
      action: "long",
      confidence: Math.min(50 + score / 2, 90),
      reason: "市場情緒積極，技術指標偏多，可考慮做多",
    };
  } else if (score <= -50) {
    recommendation = {
      action: "short",
      confidence: Math.min(50 - score / 2, 90),
      reason: "市場情緒消極，技術指標偏空，可考慮做空",
    };
  } else {
    recommendation = {
      action: "wait",
      confidence: 60,
      reason: "市場方向不明確，建議等待更清晰的信號",
    };
  }

  state.analysis = {
    sentimentScore: score,
    signals: signals.sort((a, b) => b.severity - a.severity),
    recommendation,
  };

  updateTacticalUI();
}

// ========== 數據更新函數 ==========
async function updatePrice() {
  const ticker = await fetch24hTicker();
  if (ticker) {
    state.price = {
      current: ticker.lastPrice,
      change: ticker.priceChange,
      changePercent: ticker.priceChangePercent,
      high24h: ticker.highPrice,
      low24h: ticker.lowPrice,
    };
    updatePriceUI();

    // 即時更新 K 棒
    if (state.lastCandle && state.candleSeries) {
      const currentPrice = ticker.lastPrice;
      const candle = state.lastCandle;

      // 更新這根 K 棒的收盤價、最高價、最低價
      candle.close = currentPrice;
      if (currentPrice > candle.high) candle.high = currentPrice;
      if (currentPrice < candle.low) candle.low = currentPrice;

      // 更新到圖表
      state.candleSeries.update(candle);
    }
  }
}

async function updateFunding() {
  const data = await fetchFundingRate();
  if (data) {
    state.funding = {
      rate: data.lastFundingRate,
      nextTime: data.nextFundingTime,
      markPrice: data.markPrice,
      indexPrice: data.indexPrice,
    };
    updateFundingUI();
  }
}

async function updateOI() {
  const oi = await fetchOpenInterest();
  if (oi !== null) {
    const previous = state.oi.current || oi;
    const changePercent = previous > 0 ? ((oi - previous) / previous) * 100 : 0;

    state.oi = {
      current: oi,
      previous: previous,
      changePercent: changePercent,
    };
    updateOIUI();
  }
}

async function updateLongShort() {
  const data = await fetchLongShortRatio();
  if (data) {
    state.longShort = {
      ratio: data.ratio,
      longPercent: data.longAccount * 100,
      shortPercent: data.shortAccount * 100,
      topRatio: data.topRatio,
    };
    updateLongShortUI();
  }
}

async function updateOrderFlow() {
  const trades = await fetchRecentTrades();
  if (trades.length > 0) {
    let buyVolume = 0,
      sellVolume = 0,
      buyCount = 0,
      sellCount = 0;
    const largeTrades = [];

    trades.forEach((trade) => {
      const value = trade.price * trade.quantity;
      if (trade.isSell) {
        sellVolume += value;
        sellCount++;
      } else {
        buyVolume += value;
        buyCount++;
      }

      if (trade.quantity >= CONFIG.THRESHOLDS.LARGE_ORDER) {
        largeTrades.push(trade);
      }
    });

    state.orderFlow = {
      buyVolume,
      sellVolume,
      buyCount,
      sellCount,
      delta: buyVolume - sellVolume,
      largeTrades: largeTrades.sort((a, b) => b.time - a.time),
    };
    updateOrderFlowUI();
  }
}

// ========== 初始化與啟動 ==========
async function init() {
  console.log("🚀 BTC Contract Sentinel 啟動中...");

  // 初始化圖表
  initChart();

  // 首次載入所有數據
  await Promise.all([
    updatePrice(),
    updateFunding(),
    updateOI(),
    updateLongShort(),
    updateOrderFlow(),
  ]);

  // 更新圖表
  await updateChart();

  // 首次分析
  runAnalysis();

  // 設定定時更新
  setInterval(updatePrice, CONFIG.INTERVALS.PRICE);
  setInterval(updateFunding, CONFIG.INTERVALS.FUNDING);
  setInterval(updateOI, CONFIG.INTERVALS.OI);
  setInterval(updateLongShort, CONFIG.INTERVALS.LONG_SHORT);
  setInterval(updateOrderFlow, CONFIG.INTERVALS.ORDER_FLOW);

  // 每次數據更新後重新分析
  setInterval(runAnalysis, 10000);

  // 資金費率倒數計時
  setInterval(updateFundingCountdown, 1000);

  console.log("✅ BTC Contract Sentinel 已就緒");
}

// 頁面載入後啟動
document.addEventListener("DOMContentLoaded", init);
