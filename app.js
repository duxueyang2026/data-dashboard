const DATA_URL = "./data/dashboard.json";
const VALID_PERIODS = new Set(["7", "30", "all"]);

const elements = {
  stateDot: document.querySelector("#state-dot"),
  stateText: document.querySelector("#data-state-text"),
  updatedAt: document.querySelector("#updated-at"),
  refreshButton: document.querySelector("#refresh-button"),
  errorBanner: document.querySelector("#error-banner"),
  periodCaption: document.querySelector("#period-caption"),
  revenue: document.querySelector("#metric-revenue"),
  revenueNote: document.querySelector("#metric-revenue-note"),
  orders: document.querySelector("#metric-orders"),
  ordersNote: document.querySelector("#metric-orders-note"),
  aov: document.querySelector("#metric-aov"),
  conversion: document.querySelector("#metric-conversion"),
  averageRevenue: document.querySelector("#average-revenue"),
  trendChart: document.querySelector("#trend-chart"),
  categoryList: document.querySelector("#category-list"),
  recordCount: document.querySelector("#record-count"),
  recordsBody: document.querySelector("#records-body"),
  dataAsOf: document.querySelector("#data-as-of"),
  periodButtons: [...document.querySelectorAll("[data-period]")],
};

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  notation: "compact",
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

const state = {
  data: null,
  period: getInitialPeriod(),
};

function getInitialPeriod() {
  const period = new URLSearchParams(window.location.search).get("period");
  return VALID_PERIODS.has(period) ? period : "30";
}

function validateData(data) {
  if (!data || !Array.isArray(data.daily) || !Array.isArray(data.categories)) {
    throw new Error("数据格式不正确：需要 daily 和 categories 数组。");
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
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`数据请求失败（HTTP ${response.status}）`);
    }

    const data = await response.json();
    validateData(data);
    state.data = data;
    render();
    setConnectionState("live");
  } catch (error) {
    setConnectionState("error");
    showError(`${error.message} 请检查 data/dashboard.json 后重试。`);
  } finally {
    setLoading(false);
  }
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
    elements.updatedAt.textContent = `页面刷新于 ${new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else {
    elements.stateText.textContent = "数据读取失败";
    elements.updatedAt.textContent = "";
  }
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.hidden = false;
}

function clearError() {
  elements.errorBanner.hidden = true;
  elements.errorBanner.textContent = "";
}

function getFilteredDaily() {
  const sorted = [...state.data.daily].sort((a, b) => a.date.localeCompare(b.date));
  if (state.period === "all") return sorted;

  const end = new Date(`${sorted.at(-1).date}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(state.period) + 1);
  return sorted.filter((item) => new Date(`${item.date}T00:00:00`) >= start);
}

function render() {
  const daily = getFilteredDaily();
  renderPeriodState(daily);
  renderMetrics(daily);
  renderTrend(daily);
  renderCategories(state.data.categories);
  renderRecords(state.data.records || []);
  elements.dataAsOf.textContent = state.data.meta?.updatedAt
    ? `数据更新：${state.data.meta.updatedAt}`
    : "";
}

function renderPeriodState(daily) {
  elements.periodButtons.forEach((button) => {
    const active = button.dataset.period === state.period;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (!daily.length) {
    elements.periodCaption.textContent = "所选区间暂无数据";
    return;
  }

  const first = new Date(`${daily[0].date}T00:00:00`);
  const last = new Date(`${daily.at(-1).date}T00:00:00`);
  elements.periodCaption.textContent = `${dateFormatter.format(first)} - ${dateFormatter.format(last)}`;
}

function renderMetrics(daily) {
  const totals = daily.reduce(
    (sum, item) => ({
      revenue: sum.revenue + item.revenue,
      orders: sum.orders + item.orders,
      visitors: sum.visitors + item.visitors,
    }),
    { revenue: 0, orders: 0, visitors: 0 },
  );

  const aov = totals.orders ? totals.revenue / totals.orders : 0;
  const conversion = totals.visitors ? (totals.orders / totals.visitors) * 100 : 0;

  elements.revenue.textContent = currency.format(totals.revenue);
  elements.orders.textContent = integer.format(totals.orders);
  elements.aov.textContent = currency.format(aov);
  elements.conversion.textContent = `${conversion.toFixed(2)}%`;
  elements.averageRevenue.textContent = compactCurrency.format(
    daily.length ? totals.revenue / daily.length : 0,
  );
  elements.revenueNote.textContent = `${daily.length} 天累计销售额`;
  elements.ordersNote.textContent = `${daily.length} 天累计订单`;
}

function renderTrend(daily) {
  if (!daily.length) {
    elements.trendChart.innerHTML = '<p class="empty-row">所选区间暂无趋势数据</p>';
    return;
  }

  const width = 760;
  const height = 270;
  const margin = { top: 14, right: 14, bottom: 34, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const values = daily.map((item) => item.revenue);
  const max = Math.max(...values, 1);
  const paddedMax = max * 1.12;
  const x = (index) =>
    margin.left + (daily.length === 1 ? innerWidth / 2 : (index / (daily.length - 1)) * innerWidth);
  const y = (value) => margin.top + innerHeight - (value / paddedMax) * innerHeight;
  const points = daily.map((item, index) => `${x(index)},${y(item.revenue)}`).join(" ");
  const areaPoints = `${margin.left},${margin.top + innerHeight} ${points} ${
    margin.left + innerWidth
  },${margin.top + innerHeight}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xLabelIndexes = getLabelIndexes(daily.length, 5);

  elements.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      ${yTicks
        .map((ratio) => {
          const tickY = margin.top + innerHeight - ratio * innerHeight;
          return `
            <line class="chart-grid-line" x1="${margin.left}" y1="${tickY}" x2="${
              margin.left + innerWidth
            }" y2="${tickY}"></line>
            <text class="chart-axis-label" x="${margin.left - 10}" y="${tickY + 3}" text-anchor="end">${compactCurrency.format(
              paddedMax * ratio,
            )}</text>
          `;
        })
        .join("")}
      <polygon class="chart-area" points="${areaPoints}"></polygon>
      <polyline class="chart-line" points="${points}"></polyline>
      ${daily
        .map(
          (item, index) => `
            <circle class="chart-point" cx="${x(index)}" cy="${y(item.revenue)}" r="4" tabindex="0">
              <title>${item.date}：${currency.format(item.revenue)}</title>
            </circle>
          `,
        )
        .join("")}
      ${xLabelIndexes
        .map(
          (index) => `
            <text class="chart-axis-label" x="${x(index)}" y="${height - 9}" text-anchor="middle">${dateFormatter.format(
              new Date(`${daily[index].date}T00:00:00`),
            )}</text>
          `,
        )
        .join("")}
    </svg>
  `;
}

function getLabelIndexes(length, targetCount) {
  if (length <= targetCount) return Array.from({ length }, (_, index) => index);
  const indexes = new Set([0, length - 1]);
  for (let step = 1; step < targetCount - 1; step += 1) {
    indexes.add(Math.round((step * (length - 1)) / (targetCount - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

function renderCategories(categories) {
  const sorted = [...categories].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((item) => item.value), 1);
  elements.categoryList.innerHTML = sorted
    .map(
      (item) => `
        <div class="category-row">
          <span class="category-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <div class="category-track" aria-hidden="true">
            <div class="category-bar" style="width: ${Math.max((item.value / max) * 100, 2)}%"></div>
          </div>
          <strong class="category-value">${compactCurrency.format(item.value)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderRecords(records) {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  elements.recordCount.textContent = `${sorted.length} 条记录`;

  if (!sorted.length) {
    elements.recordsBody.innerHTML = '<tr><td class="empty-row" colspan="6">暂无订单记录</td></tr>';
    return;
  }

  const statusClasses = { 处理中: "processing", 已退款: "refunded" };
  elements.recordsBody.innerHTML = sorted
    .map(
      (record) => `
        <tr>
          <td><strong>${escapeHtml(record.id)}</strong></td>
          <td>${escapeHtml(record.date)}</td>
          <td>${escapeHtml(record.category)}</td>
          <td>${escapeHtml(record.region)}</td>
          <td>${currency.format(record.amount)}</td>
          <td><span class="status-pill ${statusClasses[record.status] || ""}">${escapeHtml(
            record.status,
          )}</span></td>
        </tr>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.period = button.dataset.period;
    const url = new URL(window.location.href);
    url.searchParams.set("period", state.period);
    window.history.replaceState({}, "", url);
    if (state.data) render();
  });
});

elements.refreshButton.addEventListener("click", loadData);
window.addEventListener("resize", () => state.data && renderTrend(getFilteredDaily()));

loadData();
