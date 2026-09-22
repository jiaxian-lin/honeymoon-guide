# 12天澳洲、新西兰自由行攻略

原生 HTML、CSS 和 JavaScript 旅行手记。双击 `index.html` 可本地阅读；在线街道底图和外部导航需要联网，内置离线地图、图片和已缓存路线可离线使用。

## 编辑

章节内容集中在 `content.js`，详细说明见 `编辑说明.md`，地图数据来源见 `地图位置来源.md`。第三方地图组件许可证保存在 `assets/vendor/`。

## GitHub Pages

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。推送到 `main` 后，`Publish travel guide` 工作流会发布网站，也可以在 Actions 手动运行。

部署仅包含 `index.html`、`content.js`、`assets/`，无需 Node 构建或服务器。仓库公开时，仓库中的说明和资源也可以被访问。
