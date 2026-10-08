# GitHub 经营数据看板

这是一个不依赖构建工具的静态经营看板。页面从仓库内的
`data/dashboard.json` 读取数据，并通过 GitHub Pages 发布。

## 已有模块

- 经营总览：经营目标与达成、整体销售数据、平台对比、国家贡献、销售趋势、需要关注和经营提示
- 国家筛选：美国、英国、德国、法国、意大利、西班牙、波兰，以及欧盟（EU）聚合视图
- 时间筛选：本月、近 7 天、近 30 天、全部数据，以及可保留在网址中的自定义起止日期
- 币种显示：人民币 CNY（默认）、欧元 EUR、美元 USD；所有原始金额与目标仍以人民币为数据基准
- 销售明细：日期、国家、平台、品类、型号、销售额、订单量和 ROI
- 竞品洞察：品牌、品类、型号、国家、平台、估算销量、排名和排名变化
- 素材表现：素材、平台、发布日期、播放或曝光、点击率和贡献销售额
- 资料中心：仓库文件清单以及本地文件预览
- 库存管理：型号、仓库、可用库存、在途、日均销量、可售天数和补货建议

页面中的“演示数据”标记表示当前内容尚未接入真实业务数据。资料中心选择的本地文件
不会自动上传到 GitHub。

## 本地预览

直接打开 `index.html` 时，浏览器可能会阻止读取 JSON。请在项目目录启动静态服务器，
然后访问对应地址。例如：

```powershell
py -m http.server 8080
```

打开 `http://127.0.0.1:8080/`。

## 数据入口

所有看板数据都位于 `data/dashboard.json`：

- `meta`：数据版本、更新时间和演示状态
- `meta.exchangeRates`：以 CNY 为基准的展示汇率、汇率日期和来源
- `defaultTargets`：销售、投放、ROI 和达人费用的默认目标
- `daily`：每日销售额与订单量
- `markets`：国家和平台维度的经营汇总
- EU 聚合：筛选“欧盟（EU）”时，动态合计德国、法国、意大利、西班牙、波兰五个成员国，数据源中不重复写入 EU 行
- `platformTrends`、`countryTrends`：轻量趋势序列
- `alerts`、`tips`：需要关注与经营提示
- `salesDetails`、`competitors`、`materials`、`documents`、`inventory`：五个明细模块

## 飞书竞品数据每日同步

竞品数据来自以下飞书知识库中的电子表格：

<https://e00r0t9l67e.feishu.cn/wiki/VXHgw0UkuiMUlCkGr1Scpcy7n9e?table=tblOKZGgX9nArXDH&view=vewE4buZj8>

`.github/workflows/sync-feishu.yml` 每天北京时间 02:15 先解析该知识库链接，再读取电子表格的
第一个工作表。第一行必须是列名，后续每一行是一条竞品记录；同步将记录转换为
`data/dashboard.json` 中的 `competitors` 数组，然后提交到 `main`。这次提交会继续触发
GitHub Pages 部署。同步只替换竞品数据，不会改写销售、素材、库存等其他模块。

### 飞书应用配置

1. 在飞书开放平台创建企业自建应用。
2. 为应用开通读取知识库和电子表格所需的只读权限，并发布应用版本。
3. 在目标知识库或电子表格的权限设置中，将该应用添加为可访问成员。
4. 在 GitHub 仓库打开 **Settings > Secrets and variables > Actions**。
5. 新建 Repository secrets：`FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。
6. 打开 **Actions > Sync Feishu competitor data > Run workflow**，手动验证第一次同步。

应用密钥不得写入代码、网页或 JSON 数据。工作流每次运行时使用 Secret 换取短期
`tenant_access_token`，不会把访问令牌提交到仓库。

> 安全提示：当前 GitHub 仓库和 GitHub Pages 是公开的。同步后的竞品记录会写入公开的
> `data/dashboard.json`，任何拿到网址的人都可以读取。请勿在飞书同步视图中放入采购底价、
> 联系方式、账号、未公开合同数据或其他敏感信息。如需同步保密数据，应先改为私有数据接口
> 和带身份验证的看板，而不是继续使用公开 GitHub Pages。

### 飞书列名

默认会识别以下列名；大小写、空格和常见符号不影响匹配：

| 看板字段 | 默认支持的飞书列名 |
| --- | --- |
| 品牌 | 品牌、品牌名称、竞品品牌、brand |
| 品类 | 品类、类目、产品品类、category |
| 型号 | 型号、产品型号、商品型号、model |
| 国家 | 国家、市场、国家/市场、站点、country、market |
| 平台 | 平台、渠道、销售平台、platform、channel |
| 估算销量 | 估算销量、销量、月销量、销售量、sales、volume |
| 排名 | 排名、类目排名、榜单排名、rank |
| 排名变化 | 排名变化、排名变动、较上期变化、变化、change |

当前电子表格中的 `商品名称`、`国家地区`、`类目` 和 `日均成交量` 也会被自动识别；若未提供
排名列，看板会按日均成交量从高到低自动生成排名。品牌或商品名称、估算销量是必需字段。列名不同可以在 GitHub Actions 的 Repository variable
`FEISHU_FIELD_MAP` 中提供 JSON 映射，例如：

```json
{"brand":"竞品名称","sales":"30天销量","rank":"BSR排名","change":"排名升降"}
```

同步脚本在找不到必需字段时会让工作流失败，并输出飞书表中实际存在的列名，不会使用空数据
覆盖当前竞品列表。

网页上手动设置的目标保存在当前浏览器的 `localStorage` 中，不会改写仓库文件。后续如需
多人共用目标，应将目标写入 JSON、数据库或后端接口。

自定义时间通过 `period=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` 写入网址；日期会被限制
在数据文件实际覆盖的时间范围内。

币种通过 `currency=EUR` 或 `currency=USD` 写入网址；人民币是默认值，因此使用 CNY 时不写
币种参数。目标设置会按当前币种显示和录入，保存时自动换算回人民币基准，避免反复切换
造成累计误差。当前演示汇率采用欧洲央行 2026-09-18 参考汇率，仅用于经营分析展示。

## 发布

推送到 `main` 分支后，`.github/workflows/deploy-pages.yml` 会自动部署。GitHub Pages 的
Source 需要设置为 **GitHub Actions**。

线上地址：<https://duxueyang2026.github.io/data-dashboard/>

## 后续计划

项目后续工作和安全改造顺序记录在 [`TODO.md`](TODO.md)。当前 GitHub Pages 仅用于演示数据；
看板优化和数据校准完成后，再实施身份验证、访问白名单和受保护的数据接口，然后接入真实经营数据。
