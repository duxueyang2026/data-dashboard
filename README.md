# GitHub 数据看板

这是一个不依赖构建工具的静态网页看板。页面从仓库内的
`data/dashboard.json` 读取数据，并通过 GitHub Pages 自动部署。

## 本地预览

直接打开 `index.html` 时，浏览器可能会阻止读取 JSON。请在项目目录启动任意静态服务器，例如：

```powershell
py -m http.server 8080
```

然后打开 `http://localhost:8080`。

## 数据格式

编辑 `data/dashboard.json`，保持以下结构：

```json
{
  "meta": {
    "updatedAt": "2026-09-20 18:30"
  },
  "daily": [
    {
      "date": "2026-09-20",
      "revenue": 59480,
      "orders": 381,
      "visitors": 7290
    }
  ],
  "categories": [
    { "name": "智能家电", "value": 316800 }
  ],
  "records": [
    {
      "id": "DD-20260920-001",
      "date": "2026-09-20",
      "category": "智能家电",
      "region": "华东",
      "amount": 3299,
      "status": "已完成"
    }
  ]
}
```

必填字段是 `daily` 和 `categories`。`records` 可以为空数组。金额按人民币展示。

## 发布

推送到 `main` 分支后，`.github/workflows/deploy-pages.yml` 会自动部署页面。
首次使用时，在仓库的 **Settings > Pages > Build and deployment** 中将 **Source** 设置为
**GitHub Actions**。

发布地址：`https://duxueyang2026.github.io/data-dashboard/`
