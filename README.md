# Once Image to MP

This project is a Hugo site that uses HTML source files directly. Do not add
Markdown content unless the rendering model changes.

## Structure

- `content/<article-slug>/web.html`: normal web page source.
- `content/<article-slug>/mp.html`: WeChat public account preview source. These
  files are HTML body fragments, not full HTML documents.
- `content/<article-slug>/assets/*`: article-local images. Hugo publishes these
  files to `/<article-slug>/assets/*` at build time.
- `layouts/normal/single.html`: normal page layout. It emits the source HTML as
  a complete document.
- `layouts/mp/baseof.html`: WeChat public account preview shell. It loads the
  WeChat-compatible preview CSS, app CSS, copy button, and clipboard script.
- `layouts/mp/single.html`: WeChat public account DOM layout. It renders the
  article as `#js_article`, the title as `#activity-name`, and the content as
  `#js_content`.
- `layouts/partials/wechat-copy.html`: fixed copy button used by mp pages.
- `assets/css/app.css`: app styles processed by Hugo Pipes.
- `assets/js/wechat-copy.js`: browser-side copy pipeline for mp pages.
- `static/static/*.css`: WeChat preview CSS served from `/static/`.

## Existing Page

`content/japan-pollen-allergy-reforestation/web.html` is rendered to:

```text
/japan-pollen-allergy-reforestation.html
```

`content/japan-pollen-allergy-reforestation/mp.html` is rendered to:

```text
/mp/mp-japan-pollen-allergy-reforestation.html
```

`content/japan-pollen-allergy-reforestation/mp-easy.html` is rendered to:

```text
/mp/mp-easy-japan-pollen-allergy-reforestation.html
```

## Commands

```sh
hugo server
hugo --cleanDestinationDir
```

## New Article

Create a new article folder with:

```sh
mkdir -p content/my-article/assets
hugo new --kind normal my-article/web.html
hugo new --kind mp my-article/mp.html
```

Use front matter `url` to control the rendered public paths. Images placed in
`content/my-article/assets/` are available at:

```text
/my-article/assets/<filename>
```

Only the HTML inside `#js_content` is copied. The copy script embeds local images
as `data:image/...` URLs and writes computed styles back as inline CSS before
placing both `text/html` and `text/plain` on the clipboard.
