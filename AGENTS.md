# AGENTS.md

本项目使用 Hugo，直接用 HTML 源文件生成普通网页和微信公众号预览页。不要新增 Markdown 内容，除非同步调整渲染模型。

## Hugo

- 使用 Hugo 的常规命令预览和构建。
- 不要手改 `public/`、`resources/`、`.hugo_build.lock`，它们是生成产物或缓存。

## `content/*`

每篇文章使用一个目录：`content/<article-slug>/`。slug 用小写英文、数字和连字符。

```text
content/<article-slug>/
  web.html      # 普通网页，可选
  mp.html       # 微信公众号富文本页，可选
  mp-easy.html  # 简化版微信公众号页，可选
  assets/       # 推荐放文章图片
  image2/       # 可选补充图片目录
```

- `web.html`：front matter 使用 `type: "normal"`、`layout: "single"`、`url: "/<article-slug>.html"`；正文是完整 HTML 文档。
- `mp.html`：front matter 使用 `type: "mp"`、`layout: "single"`、`url: "/mp/mp-<article-slug>.html"`，通常还要有 `date`、`location`、`cover`；正文只写片段，不要包含 `html/head/body`。
- `mp-easy.html`：同属 `mp` 类型，URL 避免和 `mp.html` 冲突，例如 `/mp/mp-easy-<article-slug>.html`。
- 微信公众号页只复制 `#js_content` 内部内容；正文尽量使用内联样式、表格布局和基础 HTML，避免依赖外部 JS。
- 文章图片优先放 `content/<article-slug>/assets/`，引用路径写成 `/<article-slug>/assets/<filename>`；`image2/` 同理。
- 重命名或删除图片前，先在同一文章目录内搜索引用，避免 `web.html`、`mp.html`、`mp-easy.html` 断链。
