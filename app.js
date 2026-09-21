const DATA_URL = "./data/dashboard.json";
const CACHE_KEY = "dataDesk.dashboardCache.v2";
const TARGETS_KEY = "dataDesk.targets.v1";
const VALID_PERIODS = new Set(["month", "7", "30", "all", "custom"]);
const VALID_CURRENCIES = new Set(["CNY", "EUR", "USD"]);
const VALID_VIEWS = new Set([
  "overview",
  "sales",
  "competitors",
  "materials",
  "documents",
  "inventory",
]);

const VIEW_CONFIG = {
  overview: {
    eyebrow: "BUSINESS OVERVIEW",
    title: "销售数据总览",
    subtitle: "国家与平台经营表现、目标达成与管理建议",
  },
  sales: {
    eyebrow: "SALES DETAILS",
    title: "销售数据明细",
    subtitle: "按日期、国家、平台、品类和型号查看销售表现",
  },
  competitors: {
    eyebrow: "MARKET INTELLIGENCE",
    title: "竞品洞察",
    subtitle: "跟踪不同市场和平台的竞品销量、排名与趋势",
  },
  materials: {
    eyebrow: "CONTENT PERFORMANCE",
    title: "素材表现",
    subtitle: "查看已发布素材的流量、点击和成交贡献",
  },
  documents: {
    eyebrow: "REFERENCE LIBRARY",
    title: "资料中心",
    subtitle: "集中查阅经营文件及最近更新记录",
  },
  inventory: {
    eyebrow: "INVENTORY HEALTH",
    title: "库存管理",
    subtitle: "识别缺货风险、可售天数与补货需求",
  },
};

const PLATFORM_CONFIG = {
  tiktok: {
    name: "TikTok Shop",
    icon: "fa-brands fa-tiktok",
    color: "#13744d",
  },
  amazon: {
    name: "Amazon",
    icon: "fa-brands fa-amazon",
    color: "#1765a6",
  },
  dtc: {
    name: "独立站",
    icon: "fa-solid fa-store",
    color: "#a45b08",
  },
};

const COUNTRY_GROUPS = {
  EU: {
    label: "欧盟（EU）",
    members: ["DE", "FR", "IT", "ES", "PL"],
  },
};

const CURRENCY_CONFIG = {
  CNY: { label: "人民币", symbol: "¥" },
  EUR: { label: "欧元", symbol: "€" },
  USD: { label: "美元", symbol: "$" },
};

const elements = {
  stateDot: document.querySelector("#state-dot"),
  stateText: document.querySelector("#data-state-text"),
  updatedAt: document.querySelector("#updated-at"),
  refreshButton: document.querySelector("#refresh-button"),
  errorBanner: document.querySelector("#error-banner"),
  viewEyebrow: document.querySelector("#view-eyebrow"),
  viewTitle: document.querySelector("#view-title"),
  viewSubtitle: document.querySelector("#view-subtitle"),
  viewSections: [...document.querySelectorAll("[data-view-section]")],
  navItems: [...document.querySelectorAll("[data-view]")],
  periodFilter: document.querySelector("#period-filter"),
  customDateRange: document.querySelector("#custom-date-range"),
  startDateFilter: document.querySelector("#start-date-filter"),
  endDateFilter: document.querySelector("#end-date-filter"),
  countryFilter: document.querySelector("#country-filter"),
  platformFilter: document.querySelector("#platform-filter"),
  currencyFilter: document.querySelector("#currency-filter"),
  resetFilters: document.querySelector("#reset-filters"),
  filterSummary: document.querySelector("#filter-summary"),
  goalPeriod: document.querySelector("#goal-period"),
  goalGrid: document.querySelector("#goal-grid"),
  metricPeriod: document.querySelector("#metric-period"),
  metricGrid: document.querySelector("#metric-grid"),
  platformPeriod: document.querySelector("#platform-period"),
  platformGrid: document.querySelector("#platform-grid"),
  attentionList: document.querySelector("#attention-list"),
  tipsList: document.querySelector("#tips-list"),
  countrySort: document.querySelector("#country-sort"),
  countryTableBody: document.querySelector("#country-table-body"),
  trendFacts: document.querySelector("#trend-facts"),
  overallTrendCanvas: document.querySelector("#overall-trend-canvas"),
  salesDetailCount: document.querySelector("#sales-detail-count"),
  salesDetailTable: document.querySelector("#sales-detail-table"),
  competitorCount: document.querySelector("#competitor-count"),
  competitorTable: document.querySelector("#competitor-table"),
  materialCount: document.querySelector("#material-count"),
  materialTable: document.querySelector("#material-table"),
  documentUpload: document.querySelector("#document-upload"),
  documentList: document.querySelector("#document-list"),
  inventoryCount: document.querySelector("#inventory-count"),
  inventoryTable: document.querySelector("#inventory-table"),
  dataAsOf: document.querySelector("#data-as-of"),
  targetDialog: document.querySelector("#target-dialog"),
  openTargetDialog: document.querySelector("#open-target-dialog"),
  targetForm: document.querySelector("#target-form"),
  targetRevenue: document.querySelector("#target-revenue"),
  targetAdSpend: document.querySelector("#target-ad-spend"),
  targetRoi: document.querySelector("#target-roi"),
  targetCreatorCost: document.querySelector("#target-creator-cost"),
  targetCurrencyNote: document.querySelector("#target-currency-note"),
  targetCurrencySymbols: [...document.querySelectorAll(".target-currency-symbol")],
  resetTargets: document.querySelector("#reset-targets"),
  toast: document.querySelector("#toast"),
};

const integer = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

const state = {
  data: null,
  view: getInitialView(),
  filters: getInitialFilters(),
  countrySort: "revenue",
  targets: null,
  localFiles: [],
  toastTimer: null,
};

function getInitialView() {
  const value = window.location.hash.replace("#", "");
  return VALID_VIEWS.has(value) ? value : "overview";
}

function getInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  const period = params.get("period");
  return {
    period: VALID_PERIODS.has(period) ? period : "30",
    start: isIsoDate(params.get("start")) ? params.get("start") : "",
    end: isIsoDate(params.get("end")) ? params.get("end") : "",
    country: params.get("country") || "all",
    platform: params.get("platform") || "all",
    currency: VALID_CURRENCIES.has(params.get("currency"))
      ? params.get("currency")
      : "CNY",
  };
}

function validateData(data) {
  const requiredArrays = [
    "daily",
    "markets",
    "alerts",
    "tips",
    "salesDetails",
    "competitors",
    "materials",
    "documents",
    "inventory",
  ];

  if (!data || !data.meta || !data.defaultTargets) {
    throw new Error("数据格式不正确：缺少 meta 或 defaultTargets。");
  }

  const rates = data.meta.exchangeRates?.rates;
  if (
    data.meta.exchangeRates?.base !== "CNY" ||
    !rates ||
    [...VALID_CURRENCIES].some(
      (code) => !Number.isFinite(Number(rates[code])) || Number(rates[code]) <= 0,
    )
  ) {
    throw new Error("数据格式不正确：缺少以 CNY 为基准的币种汇率。");
  }

  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) {
      throw new Error(`数据格式不正确：需要 ${key} 数组。`);
    }
  }

  for (const item of data.daily) {
    if (
      !item.date ||
      !Number.isFinite(item.revenue) ||
      !Number.isFinite(item.orders) ||
      !Number.isFinite(item.visitors)
    ) {
      throw new Error("每日数据缺少 date、revenue、orders 或 visitors 字段。");
    }
  }
}

async function loadData() {
  setLoading(true);
  clearError();

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`数据请求失败（HTTP ${response.status}）`);
    }

    const data = await response.json();
    validateData(data);
    state.data = data;
    state.targets = loadTargets(data.defaultTargets);
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    initializeDashboard();
    setConnectionState("live");
  } catch (error) {
    const cached = readCachedData();
    if (cached) {
      state.data = cached;
      state.targets = loadTargets(cached.defaultTargets);
      initializeDashboard();
      setConnectionState("stale");
      showError(`${error.message}，当前显示上次成功读取的数据。`);
    } else {
      setConnectionState("error");
      showError(`${error.message}。请检查 data/dashboard.json 后重试。`);
    }
  } finally {
    setLoading(false);
  }
}

function readCachedData() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    validateData(cached);
    return cached;
  } catch {
    return null;
  }
}

function initializeDashboard() {
  populateFilters();
  renderAll();
  showView(state.view, false);
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  if (isLoading) {
    elements.stateDot.className = "state-dot";
    elements.stateText.textContent = "正在读取数据";
    elements.updatedAt.textContent = "";
  }
}

function setConnectionState(status) {
  elements.stateDot.className = `state-dot ${status}`;

  if (status === "live") {
    elements.stateText.textContent = "数据已连接";
    elements.updatedAt.textContent = `数据更新于 ${state.data.meta.updatedAt}`;
    return;
  }

  if (status === "stale") {
    elements.stateText.textContent = "正在显示缓存数据";
    elements.updatedAt.textContent = `最近数据 ${state.data.meta.updatedAt}`;
    return;
  }

  elements.stateText.textContent = "数据读取失败";
  elements.updatedAt.textContent = "";
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.hidden = false;
}

function clearError() {
  elements.errorBanner.textContent = "";
  elements.errorBanner.hidden = true;
}

function populateFilters() {
  const marketCountries = uniqueBy(
    state.data.markets.map((item) => ({
      value: item.country,
      label: item.countryName,
    })),
    "value",
  );
  const countries = [
    { value: "EU", label: COUNTRY_GROUPS.EU.label },
    ...marketCountries.filter((item) => item.value !== "EU"),
  ];
  const platforms = uniqueBy(
    state.data.markets.map((item) => ({
      value: item.platform,
      label: PLATFORM_CONFIG[item.platform]?.name || item.platform,
    })),
    "value",
  );

  elements.countryFilter.innerHTML =
    '<option value="all">全部国家</option>' +
    countries
      .map(
        (item) =>
          `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`,
      )
      .join("");

  elements.platformFilter.innerHTML =
    '<option value="all">全部平台</option>' +
    platforms
      .map(
        (item) =>
          `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`,
      )
      .join("");

  if (!countries.some((item) => item.value === state.filters.country)) {
    state.filters.country = "all";
  }
  if (!platforms.some((item) => item.value === state.filters.platform)) {
    state.filters.platform = "all";
  }

  elements.periodFilter.value = state.filters.period;
  configureCustomDateRange();
  elements.countryFilter.value = state.filters.country;
  elements.platformFilter.value = state.filters.platform;
  elements.currencyFilter.value = state.filters.currency;
}

function uniqueBy(items, key) {
  return [...new Map(items.map((item) => [item[key], item])).values()];
}

function getSelectedCurrency() {
  return VALID_CURRENCIES.has(state.filters.currency) ? state.filters.currency : "CNY";
}

function getCurrencyRate(currencyCode = getSelectedCurrency()) {
  return Number(state.data?.meta?.exchangeRates?.rates?.[currencyCode] || 1);
}

function convertFromCny(value, currencyCode = getSelectedCurrency()) {
  return Number(value || 0) * getCurrencyRate(currencyCode);
}

function convertToCny(value, currencyCode = getSelectedCurrency()) {
  return Number(value || 0) / getCurrencyRate(currencyCode);
}

function formatMoney(value, compact = false) {
  const currencyCode = getSelectedCurrency();
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(convertFromCny(value, currencyCode));
}

function formatTargetInput(value) {
  return Math.round(convertFromCny(value) * 100) / 100;
}

function getCurrencyLabel() {
  const code = getSelectedCurrency();
  return `${CURRENCY_CONFIG[code].label} ${code}`;
}

function getExchangeRateNote() {
  const exchange = state.data.meta.exchangeRates;
  const code = getSelectedCurrency();
  if (code === "CNY") {
    return `金额基准：人民币 CNY · 汇率日期 ${exchange.asOf}`;
  }
  return `ECB 参考汇率 ${exchange.asOf} · 1 CNY = ${getCurrencyRate(code).toFixed(4)} ${code}`;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && formatIsoDate(date) === value;
}

function clampDate(value, min, max) {
  if (!isIsoDate(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function configureCustomDateRange(changedControl = "") {
  const sorted = getSortedDaily();
  if (!sorted.length) return;

  const min = sorted[0].date;
  const max = sorted.at(-1).date;
  let start = clampDate(state.filters.start || min, min, max);
  let end = clampDate(state.filters.end || max, min, max);

  if (start > end) {
    if (changedControl === "end") start = end;
    else end = start;
  }

  state.filters.start = start;
  state.filters.end = end;
  elements.startDateFilter.min = min;
  elements.startDateFilter.max = max;
  elements.endDateFilter.min = min;
  elements.endDateFilter.max = max;
  elements.startDateFilter.value = start;
  elements.endDateFilter.value = end;
  elements.customDateRange.hidden = state.filters.period !== "custom";
}

function renderAll() {
  renderOverview();
  renderSalesDetails();
  renderCompetitors();
  renderMaterials();
  renderDocuments();
  renderInventory();
  elements.dataAsOf.textContent = `数据更新：${state.data.meta.updatedAt} · ${getExchangeRateNote()} · 当前为演示数据`;
}

function renderOverview() {
  renderFilterState();
  renderGoals();
  renderMetrics();
  renderPlatforms();
  renderDecisionPanels();
  renderCountries();
  renderOverallTrend();
}

function getSortedDaily() {
  return [...state.data.daily].sort((a, b) => a.date.localeCompare(b.date));
}

function getDailyForPeriod(period = state.filters.period) {
  const sorted = getSortedDaily();
  if (!sorted.length || period === "all") return sorted;

  if (period === "custom") {
    const start = state.filters.start || sorted[0].date;
    const end = state.filters.end || sorted.at(-1).date;
    return sorted.filter((item) => item.date >= start && item.date <= end);
  }

  const endDate = sorted.at(-1).date;
  if (period === "month") {
    const monthPrefix = endDate.slice(0, 7);
    return sorted.filter((item) => item.date.startsWith(monthPrefix));
  }

  const end = new Date(`${endDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(period) + 1);
  return sorted.filter((item) => new Date(`${item.date}T00:00:00`) >= start);
}

function getPeriodScale(period = state.filters.period) {
  const allRevenue = sum(getSortedDaily(), "revenue");
  const periodRevenue = sum(getDailyForPeriod(period), "revenue");
  return allRevenue ? periodRevenue / allRevenue : 0;
}

function getFilteredMarkets() {
  return state.data.markets.filter((item) => {
    const selectedGroup = COUNTRY_GROUPS[state.filters.country];
    const countryMatches =
      state.filters.country === "all" ||
      (selectedGroup
        ? selectedGroup.members.includes(item.country)
        : item.country === state.filters.country);
    const platformMatches =
      state.filters.platform === "all" || item.platform === state.filters.platform;
    return countryMatches && platformMatches;
  });
}

function getCountryLabel(country) {
  if (country === "all") return "全部国家";
  if (COUNTRY_GROUPS[country]) return COUNTRY_GROUPS[country].label;
  return (
    state.data.markets.find((item) => item.country === country)?.countryName || country
  );
}

function getMetricsForRows(rows, scale = getPeriodScale()) {
  const totals = rows.reduce(
    (result, item) => ({
      revenue: result.revenue + item.revenue,
      orders: result.orders + item.orders,
      adSpend: result.adSpend + item.adSpend,
      creatorCost: result.creatorCost + item.creatorCost,
      weightedChange: result.weightedChange + item.change * item.revenue,
    }),
    {
      revenue: 0,
      orders: 0,
      adSpend: 0,
      creatorCost: 0,
      weightedChange: 0,
    },
  );

  const baseRevenue = totals.revenue;
  return {
    revenue: totals.revenue * scale,
    orders: totals.orders * scale,
    adSpend: totals.adSpend * scale,
    creatorCost: totals.creatorCost * scale,
    roi: totals.adSpend ? totals.revenue / totals.adSpend : 0,
    change: baseRevenue ? totals.weightedChange / baseRevenue : 0,
  };
}

function renderFilterState() {
  const daily = getDailyForPeriod();
  const periodText = getPeriodLabel();
  const countryText = getCountryLabel(state.filters.country);
  const platformText =
    state.filters.platform === "all"
      ? "全部平台"
      : PLATFORM_CONFIG[state.filters.platform]?.name || state.filters.platform;
  const currencyText = getCurrencyLabel();

  elements.platformPeriod.textContent = periodText;
  elements.metricPeriod.textContent = periodText;

  if (!daily.length) {
    elements.filterSummary.textContent = "所选区间暂无数据";
    return;
  }

  const start = new Date(`${daily[0].date}T00:00:00`);
  const end = new Date(`${daily.at(-1).date}T00:00:00`);
  elements.filterSummary.textContent =
    `${dateFormatter.format(start)} - ${dateFormatter.format(end)} · ${countryText} · ${platformText} · ${currencyText}`;
}

function getPeriodLabel() {
  const labels = {
    month: "本月",
    7: "近 7 天",
    30: "近 30 天",
    all: "全部数据",
    custom: "自定义时间",
  };
  return labels[state.filters.period];
}

function renderGoals() {
  const monthlyDaily = getDailyForPeriod("month");
  const monthlyScale = getPeriodScale("month");
  const actual = getMetricsForRows(state.data.markets, monthlyScale);
  const lastDate = new Date(`${getSortedDaily().at(-1).date}T00:00:00`);
  const monthStart = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
  const monthEnd = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0);
  const timeProgress = (lastDate.getDate() / monthEnd.getDate()) * 100;

  elements.goalPeriod.textContent =
    `${formatIsoDate(monthStart)} 至 ${formatIsoDate(monthEnd)} · 已录入 ${monthlyDaily.length} 天`;

  const revenueProgress = ratioPercent(actual.revenue, state.targets.revenue);
  const adProgress = ratioPercent(actual.adSpend, state.targets.adSpend);
  const roiProgress = ratioPercent(actual.roi, state.targets.roi);
  const creatorProgress = ratioPercent(actual.creatorCost, state.targets.creatorCost);
  const lead = revenueProgress - timeProgress;

  const goalItems = [
    {
      label: "销售目标",
      value: formatMoney(state.targets.revenue),
      meta: `已完成 <strong>${formatMoney(actual.revenue)}</strong> · ${revenueProgress.toFixed(1)}%`,
      subMeta: `时间进度 ${timeProgress.toFixed(1)}% · ${lead >= 0 ? "领先" : "落后"} ${Math.abs(
        lead,
      ).toFixed(1)} 个百分点`,
      progress: revenueProgress,
      className: lead < -5 ? "warning" : "",
    },
    {
      label: "投放预算",
      value: formatMoney(state.targets.adSpend),
      meta: `已用 <strong>${formatMoney(actual.adSpend)}</strong> · ${adProgress.toFixed(1)}%`,
      subMeta: `剩余 ${formatMoney(Math.max(state.targets.adSpend - actual.adSpend, 0))}`,
      progress: adProgress,
      className: adProgress > 100 ? "danger" : "",
    },
    {
      label: "ROI 目标",
      value: state.targets.roi.toFixed(2),
      meta: `当前 <strong>${actual.roi.toFixed(2)}</strong> · 达成 ${roiProgress.toFixed(1)}%`,
      subMeta:
        actual.roi >= state.targets.roi
          ? `高于目标 ${(actual.roi - state.targets.roi).toFixed(2)}`
          : `距离目标 ${(state.targets.roi - actual.roi).toFixed(2)}`,
      progress: roiProgress,
      className: roiProgress < 90 ? "warning" : "",
    },
    {
      label: "达人合作费用预算",
      value: formatMoney(state.targets.creatorCost),
      meta: `已用 <strong>${formatMoney(actual.creatorCost)}</strong> · ${creatorProgress.toFixed(
        1,
      )}%`,
      subMeta: `剩余 ${formatMoney(
        Math.max(state.targets.creatorCost - actual.creatorCost, 0),
      )}`,
      progress: creatorProgress,
      className: creatorProgress > 100 ? "danger" : "",
    },
  ];

  elements.goalGrid.innerHTML = goalItems
    .map(
      (item) => `
        <article class="goal-item">
          <div class="goal-label"><span>${item.label}</span></div>
          <strong class="goal-value">${item.value}</strong>
          <p class="goal-meta"><span>${item.meta}</span><span>${item.subMeta}</span></p>
          <div class="progress-track" aria-label="${item.label}达成 ${Math.min(
            item.progress,
            999,
          ).toFixed(1)}%">
            <div class="progress-fill ${item.className}" style="width: ${Math.min(
              item.progress,
              100,
            )}%"></div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMetrics() {
  const metrics = getMetricsForRows(getFilteredMarkets());
  const comparisons = state.data.comparisons;
  const cards = [
    {
      label: "销售额",
      icon: "fa-solid fa-sack-dollar",
      value: formatMoney(metrics.revenue),
      change: comparisons.revenue,
      note: "较上期",
      inverse: false,
      featured: true,
    },
    {
      label: "订单量",
      icon: "fa-solid fa-cart-shopping",
      value: integer.format(metrics.orders),
      change: comparisons.orders,
      note: "较上期",
      inverse: false,
    },
    {
      label: "投放消耗",
      icon: "fa-solid fa-bullhorn",
      value: formatMoney(metrics.adSpend),
      change: comparisons.adSpend,
      note: "较上期",
      inverse: true,
    },
    {
      label: "整体 ROI",
      icon: "fa-solid fa-arrow-trend-up",
      value: metrics.roi.toFixed(2),
      change: comparisons.roi,
      note: "较上期",
      inverse: false,
    },
    {
      label: "达人合作费用",
      icon: "fa-regular fa-user",
      value: formatMoney(metrics.creatorCost),
      change: comparisons.creatorCost,
      note: "较上期",
      inverse: true,
    },
  ];

  elements.metricGrid.innerHTML = cards
    .map((card) => {
      const favorable = card.inverse ? card.change <= 0 : card.change >= 0;
      const direction = card.change >= 0 ? "上升" : "下降";
      return `
        <article class="metric-card${card.featured ? " metric-card-featured" : ""}">
          <div class="metric-heading">
            <span>${card.label}</span>
            <i class="${card.icon}" aria-hidden="true"></i>
          </div>
          <strong class="metric-value">${card.value}</strong>
          <p class="metric-change">
            <strong class="${favorable ? "change-positive" : "change-negative"}">
              ${card.change >= 0 ? "▲" : "▼"} ${Math.abs(card.change).toFixed(1)}%
            </strong>
            <span>${card.note} · ${direction}</span>
          </p>
        </article>
      `;
    })
    .join("");
}

function renderPlatforms() {
  const rows = getFilteredMarkets();
  const platforms = Object.keys(PLATFORM_CONFIG).filter(
    (platform) => state.filters.platform === "all" || platform === state.filters.platform,
  );

  if (!rows.length) {
    elements.platformGrid.innerHTML = '<p class="empty-state">当前筛选条件下暂无平台数据</p>';
    return;
  }

  elements.platformGrid.innerHTML = platforms
    .map((platform) => {
      const platformRows = rows.filter((item) => item.platform === platform);
      if (!platformRows.length) return "";
      const metrics = getMetricsForRows(platformRows);
      const config = PLATFORM_CONFIG[platform];
      const trend = state.data.platformTrends[platform] || [];
      return `
        <article class="platform-lane">
          <div class="platform-heading">
            <i class="${config.icon}" aria-hidden="true"></i>
            <h3>${config.name}</h3>
            <i class="fa-solid fa-chevron-right drill-icon" aria-hidden="true"></i>
          </div>
          <div class="platform-stats">
            ${platformStat("销售额", formatMoney(metrics.revenue))}
            ${platformStat("订单量", integer.format(metrics.orders))}
            ${platformStat("ROI", metrics.roi.toFixed(2))}
            ${platformStat("投放消耗", formatMoney(metrics.adSpend))}
            ${platformStat("达人费用", formatMoney(metrics.creatorCost))}
          </div>
          <div class="sparkline-block">
            <div class="sparkline-heading">
              <span>${getPeriodLabel()}销售趋势</span>
              <strong class="${metrics.change >= 0 ? "change-positive" : "change-negative"}">
                ${metrics.change >= 0 ? "+" : ""}${metrics.change.toFixed(1)}%
              </strong>
            </div>
            <canvas
              class="sparkline"
              data-sparkline="${trend.join(",")}"
              data-color="${config.color}"
              role="img"
              aria-label="${config.name}销售趋势，较上期${metrics.change >= 0 ? "增长" : "下降"}${Math.abs(
                metrics.change,
              ).toFixed(1)}%"
            ></canvas>
          </div>
        </article>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    document.querySelectorAll("[data-sparkline]").forEach((canvas) => {
      drawSparkline(
        canvas,
        canvas.dataset.sparkline.split(",").map(Number),
        canvas.dataset.color,
      );
    });
  });
}

function platformStat(label, value) {
  return `
    <div class="platform-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderDecisionPanels() {
  elements.attentionList.innerHTML = state.data.alerts
    .map(
      (item) => `
        <article class="decision-item">
          <span class="severity ${escapeHtml(item.severity)}">${escapeHtml(item.label)}</span>
          <div class="decision-copy">
            <p class="decision-title">${escapeHtml(item.title)}</p>
            <p class="decision-meta">负责人 ${escapeHtml(item.owner)} · 截止 ${escapeHtml(
              item.deadline,
            )}</p>
            <p class="decision-action">下一步：${escapeHtml(item.action)}</p>
          </div>
        </article>
      `,
    )
    .join("");

  elements.tipsList.innerHTML = state.data.tips
    .map(
      (item) => `
        <article class="decision-item">
          <span class="severity tip"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
          <div class="decision-copy">
            <p class="decision-title">${escapeHtml(item.title)}</p>
            <p class="decision-action">${escapeHtml(item.action)}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderCountries() {
  const rows = getFilteredMarkets();
  const scale = getPeriodScale();
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.country)) {
      grouped.set(row.country, {
        country: row.country,
        countryName: row.countryName,
        rows: [],
      });
    }
    grouped.get(row.country).rows.push(row);
  }

  let countries = [...grouped.values()].map((group) => ({
    ...group,
    metrics: getMetricsForRows(group.rows, scale),
  }));

  const sorters = {
    revenue: (a, b) => b.metrics.revenue - a.metrics.revenue,
    roi: (a, b) => b.metrics.roi - a.metrics.roi,
    change: (a, b) => b.metrics.change - a.metrics.change,
  };
  countries.sort(sorters[state.countrySort] || sorters.revenue);
  const totalRevenue = countries.reduce((total, item) => total + item.metrics.revenue, 0);

  if (!countries.length) {
    elements.countryTableBody.innerHTML =
      '<tr><td class="empty-state" colspan="7">当前筛选条件下暂无国家数据</td></tr>';
    return;
  }

  elements.countryTableBody.innerHTML = countries
    .map((item, index) => {
      const trend = state.data.countryTrends[item.country] || [];
      const share = totalRevenue ? (item.metrics.revenue / totalRevenue) * 100 : 0;
      return `
        <tr>
          <td data-label="排名"><span class="rank-badge ${index === 0 ? "top" : ""}">${index + 1}</span></td>
          <td data-label="国家"><span class="country-code">${escapeHtml(
            item.country,
          )}</span><strong>${escapeHtml(item.countryName)}</strong></td>
          <td data-label="销售额"><strong>${formatMoney(item.metrics.revenue)}</strong></td>
          <td data-label="占比">${share.toFixed(1)}%</td>
          <td data-label="ROI">${item.metrics.roi.toFixed(2)}</td>
          <td data-label="趋势">
            <canvas
              class="country-trend"
              data-country-trend="${trend.join(",")}"
              data-color="${item.metrics.change >= 0 ? "#13744d" : "#c44747"}"
              role="img"
              aria-label="${escapeHtml(item.countryName)}销售趋势"
            ></canvas>
          </td>
          <td data-label="较上期">
            <strong class="${item.metrics.change >= 0 ? "change-positive" : "change-negative"}">
              ${item.metrics.change >= 0 ? "▲" : "▼"} ${Math.abs(item.metrics.change).toFixed(1)}%
            </strong>
          </td>
        </tr>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    document.querySelectorAll("[data-country-trend]").forEach((canvas) => {
      drawSparkline(
        canvas,
        canvas.dataset.countryTrend.split(",").map(Number),
        canvas.dataset.color,
        false,
      );
    });
  });
}

function renderOverallTrend() {
  const daily = getDailyForPeriod();
  const marketShare =
    getMetricsForRows(getFilteredMarkets(), 1).revenue /
    Math.max(getMetricsForRows(state.data.markets, 1).revenue, 1);
  const values = daily.map((item) => ({
    date: item.date,
    value: item.revenue * marketShare,
  }));
  const total = values.reduce((result, item) => result + item.value, 0);
  const average = values.length ? total / values.length : 0;
  const peak = values.reduce(
    (best, item) => (item.value > best.value ? item : best),
    { date: "", value: 0 },
  );

  elements.trendFacts.innerHTML = `
    <span class="trend-fact">周期销售额<strong>${formatMoney(total)}</strong></span>
    <span class="trend-fact">日均<strong>${formatMoney(average)}</strong></span>
    <span class="trend-fact">峰值<strong>${formatMoney(peak.value)}</strong></span>
  `;

  elements.overallTrendCanvas.setAttribute(
    "aria-label",
    `${getPeriodLabel()}整体销售趋势，累计${formatMoney(total)}，日均${formatMoney(
      average,
    )}`,
  );
  requestAnimationFrame(() => drawOverallTrend(elements.overallTrendCanvas, values));
}

function drawSparkline(canvas, values, color, fill = true) {
  if (!canvas || !values.length) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const padding = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => ({
    x: padding + (index / Math.max(values.length - 1, 1)) * (rect.width - padding * 2),
    y: rect.height - padding - ((value - min) / range) * (rect.height - padding * 2),
  }));

  if (fill) {
    context.beginPath();
    context.moveTo(points[0].x, rect.height - padding);
    points.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(points.at(-1).x, rect.height - padding);
    context.closePath();
    context.globalAlpha = 0.1;
    context.fillStyle = color;
    context.fill();
    context.globalAlpha = 1;
  }

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = color;
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

function drawOverallTrend(canvas, values) {
  if (!canvas || !values.length || state.view !== "overview") return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const margin = {
    top: 24,
    right: 24,
    bottom: 28,
    left: rect.width < 560 ? 47 : 60,
  };
  const plotWidth = rect.width - margin.left - margin.right;
  const plotHeight = rect.height - margin.top - margin.bottom;
  const maximum = Math.max(...values.map((item) => item.value), 1) * 1.12;
  const x = (index) =>
    margin.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
  const y = (value) => margin.top + plotHeight - (value / maximum) * plotHeight;

  context.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif';
  context.textBaseline = "middle";
  context.strokeStyle = "#e3e9e5";
  context.fillStyle = "#68776f";
  context.lineWidth = 1;

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const tickY = margin.top + plotHeight - ratio * plotHeight;
    context.beginPath();
    context.moveTo(margin.left, tickY);
    context.lineTo(margin.left + plotWidth, tickY);
    context.stroke();
    context.textAlign = "right";
    context.fillText(formatMoney(maximum * ratio, true), margin.left - 8, tickY);
  }

  const points = values.map((item, index) => ({
    x: x(index),
    y: y(item.value),
    ...item,
  }));

  context.beginPath();
  context.moveTo(points[0].x, margin.top + plotHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points.at(-1).x, margin.top + plotHeight);
  context.closePath();
  context.globalAlpha = 0.11;
  context.fillStyle = "#13744d";
  context.fill();
  context.globalAlpha = 1;

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = "#13744d";
  context.lineWidth = 2.25;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  const labelIndexes = getLabelIndexes(values.length, rect.width < 560 ? 3 : 5);
  context.fillStyle = "#68776f";
  context.textAlign = "center";
  context.textBaseline = "top";
  labelIndexes.forEach((index) => {
    context.fillText(
      dateFormatter.format(new Date(`${values[index].date}T00:00:00`)),
      points[index].x,
      margin.top + plotHeight + 9,
    );
  });

  const last = points.at(-1);
  context.beginPath();
  context.arc(last.x, last.y, 4, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#13744d";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#075f3b";
  context.font = '700 10px "Segoe UI", "Microsoft YaHei", sans-serif';
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText(formatMoney(last.value), last.x - 7, last.y - 6);
}

function getLabelIndexes(length, targetCount) {
  if (length <= targetCount) {
    return Array.from({ length }, (_, index) => index);
  }
  const indexes = new Set([0, length - 1]);
  for (let step = 1; step < targetCount - 1; step += 1) {
    indexes.add(Math.round((step * (length - 1)) / (targetCount - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

function renderSalesDetails() {
  elements.salesDetailCount.textContent = `${state.data.salesDetails.length} 条记录`;
  elements.salesDetailTable.innerHTML = buildResponsiveTable(
    [
      { label: "日期", value: (item) => escapeHtml(item.date) },
      { label: "国家", value: (item) => escapeHtml(item.country) },
      { label: "平台", value: (item) => escapeHtml(item.platform) },
      { label: "品类", value: (item) => escapeHtml(item.category) },
      { label: "型号", value: (item) => `<strong>${escapeHtml(item.model)}</strong>` },
      { label: "销售额", value: (item) => formatMoney(item.revenue) },
      { label: "订单量", value: (item) => integer.format(item.orders) },
      { label: "ROI", value: (item) => Number(item.roi).toFixed(2) },
    ],
    state.data.salesDetails,
  );
}

function renderCompetitors() {
  elements.competitorCount.textContent = `${state.data.competitors.length} 个竞品`;
  elements.competitorTable.innerHTML = buildResponsiveTable(
    [
      { label: "品牌", value: (item) => `<strong>${escapeHtml(item.brand)}</strong>` },
      { label: "品类", value: (item) => escapeHtml(item.category) },
      { label: "型号", value: (item) => escapeHtml(item.model) },
      { label: "国家", value: (item) => escapeHtml(item.country) },
      { label: "平台", value: (item) => escapeHtml(item.platform) },
      { label: "估算销量", value: (item) => integer.format(item.sales) },
      { label: "排名", value: (item) => `第 ${integer.format(item.rank)} 名` },
      {
        label: "排名变化",
        value: (item) =>
          `<strong class="${item.change >= 0 ? "change-positive" : "change-negative"}">${item.change >= 0 ? "▲" : "▼"} ${Math.abs(
            item.change,
          )}</strong>`,
      },
    ],
    state.data.competitors,
  );
}

function renderMaterials() {
  elements.materialCount.textContent = `${state.data.materials.length} 条素材`;
  elements.materialTable.innerHTML = buildResponsiveTable(
    [
      { label: "素材名称", value: (item) => `<strong>${escapeHtml(item.name)}</strong>` },
      { label: "平台", value: (item) => escapeHtml(item.platform) },
      { label: "类型", value: (item) => escapeHtml(item.type) },
      { label: "发布日期", value: (item) => escapeHtml(item.publishedAt) },
      { label: "播放/曝光", value: (item) => integer.format(item.views) },
      { label: "点击率", value: (item) => `${Number(item.ctr).toFixed(1)}%` },
      { label: "贡献销售额", value: (item) => formatMoney(item.revenue) },
      {
        label: "状态",
        value: (item) =>
          `<span class="status-label ${item.status === "待优化" ? "warning" : ""}">${escapeHtml(
            item.status,
          )}</span>`,
      },
    ],
    state.data.materials,
  );
}

function renderDocuments() {
  const repositoryDocuments = state.data.documents.map((item) => ({
    ...item,
    source: "GitHub 仓库",
  }));
  const localDocuments = state.localFiles.map((item) => ({
    ...item,
    source: "本地预览，尚未同步",
  }));
  const documents = [...localDocuments, ...repositoryDocuments];

  elements.documentList.innerHTML = documents
    .map((item) => {
      const icon = getDocumentIcon(item.type);
      return `
        <article class="document-row">
          <span class="document-icon" aria-hidden="true"><i class="${icon}"></i></span>
          <div class="document-name">
            <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.type)} · ${escapeHtml(item.owner || item.source)}</span>
          </div>
          <time class="document-time">${escapeHtml(item.updatedAt)}</time>
        </article>
      `;
    })
    .join("");
}

function getDocumentIcon(type) {
  const value = String(type).toLowerCase();
  if (value.includes("excel") || value.includes("csv") || value.includes("sheet")) {
    return "fa-regular fa-file-excel";
  }
  if (value.includes("pdf")) return "fa-regular fa-file-pdf";
  if (value.includes("word") || value.includes("doc")) return "fa-regular fa-file-word";
  if (value.includes("image")) return "fa-regular fa-file-image";
  return "fa-regular fa-file";
}

function renderInventory() {
  elements.inventoryCount.textContent = `${state.data.inventory.length} 个 SKU`;
  elements.inventoryTable.innerHTML = buildResponsiveTable(
    [
      { label: "SKU", value: (item) => `<strong>${escapeHtml(item.sku)}</strong>` },
      { label: "型号", value: (item) => escapeHtml(item.model) },
      { label: "国家", value: (item) => escapeHtml(item.country) },
      { label: "仓库", value: (item) => escapeHtml(item.warehouse) },
      { label: "可售库存", value: (item) => integer.format(item.available) },
      { label: "预计可售", value: (item) => `${integer.format(item.days)} 天` },
      {
        label: "库存状态",
        value: (item) =>
          `<span class="status-label ${statusClass(item.status)}">${escapeHtml(
            item.status,
          )}</span>`,
      },
      {
        label: "建议补货",
        value: (item) => (item.suggested ? integer.format(item.suggested) : "暂不补货"),
      },
    ],
    state.data.inventory,
  );
}

function statusClass(status) {
  if (status === "需补货") return "danger";
  if (status === "关注") return "warning";
  return "";
}

function buildResponsiveTable(columns, rows) {
  return `
    <table class="data-table responsive-table">
      <thead>
        <tr>${columns.map((column) => `<th scope="col">${column.label}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                ${columns
                  .map(
                    (column) =>
                      `<td data-label="${column.label}">${column.value(item)}</td>`,
                  )
                  .join("")}
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function showView(view, updateHistory = true) {
  state.view = VALID_VIEWS.has(view) ? view : "overview";
  const config = VIEW_CONFIG[state.view];

  elements.viewEyebrow.textContent = config.eyebrow;
  elements.viewTitle.textContent = config.title;
  elements.viewSubtitle.textContent = config.subtitle;
  document.title = `${config.title} | DATA DESK`;

  elements.navItems.forEach((item) => {
    const active = item.dataset.view === state.view;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  elements.viewSections.forEach((section) => {
    const active = section.dataset.viewSection === state.view;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });

  if (updateHistory) {
    const url = new URL(window.location.href);
    url.hash = state.view;
    window.history.pushState({}, "", url);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (state.view === "overview" && state.data) {
    requestAnimationFrame(renderOverview);
  }
}

function updateFilterState(changedDateControl = "") {
  state.filters = {
    period: elements.periodFilter.value,
    start: elements.startDateFilter.value,
    end: elements.endDateFilter.value,
    country: elements.countryFilter.value,
    platform: elements.platformFilter.value,
    currency: elements.currencyFilter.value,
  };

  configureCustomDateRange(changedDateControl);

  const url = new URL(window.location.href);
  if (state.filters.period === "30") url.searchParams.delete("period");
  else url.searchParams.set("period", state.filters.period);

  for (const key of ["country", "platform"]) {
    const value = state.filters[key];
    if (value === "all") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }

  if (state.filters.currency === "CNY") url.searchParams.delete("currency");
  else url.searchParams.set("currency", state.filters.currency);

  if (state.filters.period === "custom") {
    url.searchParams.set("start", state.filters.start);
    url.searchParams.set("end", state.filters.end);
  } else {
    url.searchParams.delete("start");
    url.searchParams.delete("end");
  }

  window.history.replaceState({}, "", url);
  renderOverview();
  renderSalesDetails();
  renderMaterials();
  elements.dataAsOf.textContent = `数据更新：${state.data.meta.updatedAt} · ${getExchangeRateNote()} · 当前为演示数据`;
}

function loadTargets(defaultTargets) {
  try {
    const saved = JSON.parse(localStorage.getItem(TARGETS_KEY));
    if (
      saved?.version === 1 &&
      ["revenue", "adSpend", "roi", "creatorCost"].every(
        (key) => Number.isFinite(Number(saved[key])) && Number(saved[key]) >= 0,
      )
    ) {
      return {
        revenue: Number(saved.revenue),
        adSpend: Number(saved.adSpend),
        roi: Number(saved.roi),
        creatorCost: Number(saved.creatorCost),
      };
    }
  } catch {
    localStorage.removeItem(TARGETS_KEY);
  }
  return { ...defaultTargets };
}

function fillTargetForm(targets) {
  const currencyCode = getSelectedCurrency();
  elements.targetRevenue.value = formatTargetInput(targets.revenue);
  elements.targetAdSpend.value = formatTargetInput(targets.adSpend);
  elements.targetRoi.value = targets.roi;
  elements.targetCreatorCost.value = formatTargetInput(targets.creatorCost);
  elements.targetCurrencySymbols.forEach((element) => {
    element.textContent = CURRENCY_CONFIG[currencyCode].symbol;
  });
  elements.targetCurrencyNote.textContent =
    `当前按 ${getCurrencyLabel()} 录入；保存时统一换算为人民币基准。${getExchangeRateNote()}。`;
}

function saveTargetsFromForm() {
  const nextTargets = {
    revenue: Math.round(convertToCny(Number(elements.targetRevenue.value)) * 100) / 100,
    adSpend: Math.round(convertToCny(Number(elements.targetAdSpend.value)) * 100) / 100,
    roi: Number(elements.targetRoi.value),
    creatorCost:
      Math.round(convertToCny(Number(elements.targetCreatorCost.value)) * 100) / 100,
  };

  if (Object.values(nextTargets).some((value) => !Number.isFinite(value) || value < 0)) {
    return false;
  }

  state.targets = nextTargets;
  localStorage.setItem(
    TARGETS_KEY,
    JSON.stringify({
      version: 1,
      ...nextTargets,
    }),
  );
  renderGoals();
  showToast(`经营目标已按人民币基准保存，当前显示为${getCurrencyLabel()}`);
  return true;
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2800);
}

function ratioPercent(value, target) {
  return target > 0 ? (value / target) * 100 : 0;
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.navItems.forEach((item) => {
  item.addEventListener("click", () => showView(item.dataset.view));
});

elements.periodFilter.addEventListener("change", () => updateFilterState());
elements.countryFilter.addEventListener("change", () => updateFilterState());
elements.platformFilter.addEventListener("change", () => updateFilterState());
elements.currencyFilter.addEventListener("change", () => updateFilterState());
elements.startDateFilter.addEventListener("change", () => updateFilterState("start"));
elements.endDateFilter.addEventListener("change", () => updateFilterState("end"));

elements.resetFilters.addEventListener("click", () => {
  state.filters = {
    period: "30",
    start: "",
    end: "",
    country: "all",
    platform: "all",
    currency: "CNY",
  };
  elements.periodFilter.value = state.filters.period;
  elements.countryFilter.value = state.filters.country;
  elements.platformFilter.value = state.filters.platform;
  elements.currencyFilter.value = state.filters.currency;
  configureCustomDateRange();
  updateFilterState();
});

elements.countrySort.addEventListener("change", () => {
  state.countrySort = elements.countrySort.value;
  renderCountries();
});

elements.refreshButton.addEventListener("click", async () => {
  await loadData();
  if (state.data) {
    showToast(`页面已刷新，数据版本：${state.data.meta.updatedAt}`);
  }
});

elements.openTargetDialog.addEventListener("click", () => {
  fillTargetForm(state.targets);
  elements.targetDialog.showModal();
});

elements.targetForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "default") return;
  event.preventDefault();
  if (!elements.targetForm.reportValidity()) return;
  if (saveTargetsFromForm()) elements.targetDialog.close();
});

elements.resetTargets.addEventListener("click", () => {
  fillTargetForm(state.data.defaultTargets);
  showToast("已填入演示目标，点击“保存目标”后生效");
});

elements.documentUpload.addEventListener("change", () => {
  const now = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  state.localFiles = [...elements.documentUpload.files].map((file) => ({
    name: file.name,
    type: file.type || file.name.split(".").at(-1)?.toUpperCase() || "文件",
    owner: "本地预览，尚未同步",
    updatedAt: now,
  }));
  renderDocuments();
  showToast(`已选择 ${state.localFiles.length} 个文件，仅在当前页面预览`);
});

window.addEventListener("popstate", () => {
  state.view = getInitialView();
  state.filters = getInitialFilters();
  if (state.data) {
    populateFilters();
    renderAll();
    showView(state.view, false);
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (state.data && state.view === "overview") renderOverview();
  }, 120);
});

loadData();
