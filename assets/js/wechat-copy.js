(function () {
  "use strict";

  var COPY_ROOT_ID = "js_content";
  var COPY_BUTTON_ID = "smartmd-copy-btn";

  function mergeInlineStyle(el, extraCss) {
    if (!el || !extraCss) return;
    var current = (el.getAttribute("style") || "").trim();
    if (current && !/;\s*$/.test(current)) current += ";";
    el.setAttribute("style", current + extraCss);
  }

  function computedPropsToCss(el, propNames, skipBgTransparent) {
    if (!el) return "";
    var cs = getComputedStyle(el);
    var parts = [];

    propNames.forEach(function (name) {
      var value = cs.getPropertyValue(name);
      if (value == null || value === "") return;
      if (skipBgTransparent && name === "background-color") {
        var lowered = value.trim().toLowerCase();
        if (
          lowered === "transparent" ||
          lowered === "rgba(0, 0, 0, 0)" ||
          lowered === "rgba(0,0,0,0)"
        ) {
          return;
        }
      }
      parts.push(name + ":" + value + ";");
    });

    return parts.join("");
  }

  function inlineRule(root, selector, propNames, skipBgTransparent, extraCss) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(function (el) {
      mergeInlineStyle(el, computedPropsToCss(el, propNames, skipBgTransparent));
      mergeInlineStyle(el, extraCss);
    });
  }

  function waitForImages(root) {
    if (!root) return Promise.resolve();

    var imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
    if (!imgs.length) return Promise.resolve();

    return Promise.all(
      imgs.map(function (img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        if (typeof img.decode === "function") {
          return Promise.race([
            img.decode().catch(function () {}),
            new Promise(function (resolve) {
              setTimeout(resolve, 1200);
            }),
          ]);
        }

        return new Promise(function (resolve) {
          var done = function () {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };

          img.addEventListener("load", done);
          img.addEventListener("error", done);
          setTimeout(done, 1200);
        });
      })
    ).then(function () {});
  }

  function normalizeCodeBlocks(root) {
    if (!root) return;

    root.querySelectorAll("pre").forEach(function (pre) {
      var parent = pre.parentElement;
      if (parent && parent.classList && parent.classList.contains("smartmd-code-wrap")) return;
      var wrap = document.createElement("div");
      wrap.className = "smartmd-code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    });

    root.querySelectorAll("pre code").forEach(function (code) {
      var cls = (code.getAttribute("class") || "").trim();
      if (!cls) return;
      cls.split(/\s+/).forEach(function (token) {
        if (!token || token.indexOf("language-") === 0) return;
        if (/^[a-z][a-z0-9_-]*$/i.test(token)) code.classList.add("language-" + token);
      });
    });
  }

  function urlToDataURL(absUrl) {
    return fetch(absUrl, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve(reader.result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
  }

  function shouldInlineSrc(src) {
    if (!src || !String(src).trim()) return false;
    var normalized = String(src).trim().toLowerCase();
    if (normalized.indexOf("data:") === 0 || normalized.indexOf("blob:") === 0) return false;
    return true;
  }

  function embedImagesInHtml(htmlString) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, "text/html");
    var imgs = doc.body.querySelectorAll("img[src]");
    var seen = {};
    var urls = [];

    imgs.forEach(function (img) {
      var raw = img.getAttribute("src");
      if (!shouldInlineSrc(raw)) return;

      var resolved;
      try {
        resolved = new URL(raw, location.href).href;
      } catch (err) {
        console.warn("smartmd-copy: skip bad src", raw, err);
        return;
      }

      if (!seen[resolved]) {
        seen[resolved] = true;
        urls.push(resolved);
      }
    });

    var dataUrlByResolved = {};
    return Promise.all(
      urls.map(function (url) {
        return urlToDataURL(url).then(
          function (dataUrl) {
            dataUrlByResolved[url] = dataUrl;
          },
          function (err) {
            console.warn("smartmd-copy: inline failed", url, err);
          }
        );
      })
    ).then(function () {
      imgs.forEach(function (img) {
        var raw = img.getAttribute("src");
        if (!shouldInlineSrc(raw)) return;

        var resolved;
        try {
          resolved = new URL(raw, location.href).href;
        } catch (err) {
          return;
        }

        if (dataUrlByResolved[resolved]) {
          img.setAttribute("src", dataUrlByResolved[resolved]);
        }
      });

      return doc.body.innerHTML;
    });
  }

  function stabilizeCodeWhitespaceForClipboard(root) {
    var targets = [];

    function pushUnique(el) {
      if (!el || targets.indexOf(el) >= 0) return;
      targets.push(el);
    }

    root.querySelectorAll("pre").forEach(function (pre) {
      var directCodeChild = null;
      for (var i = 0; i < pre.children.length; i += 1) {
        if (pre.children[i].tagName === "CODE") {
          directCodeChild = pre.children[i];
          break;
        }
      }
      pushUnique(directCodeChild || pre);
    });

    root.querySelectorAll("code[class*='language-']").forEach(function (code) {
      if (code.closest("pre")) return;
      pushUnique(code);
    });

    targets.forEach(function (target) {
      var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
      var textNodes = [];
      var node = walker.nextNode();

      while (node) {
        textNodes.push(node);
        node = walker.nextNode();
      }

      textNodes.forEach(function (textNode) {
        var value = textNode.nodeValue || "";
        if (!/[ \t]/.test(value)) return;
        if (/^[ \t]+$/.test(value)) {
          textNode.nodeValue = value.replace(/\t/g, "    ").replace(/ /g, "\u00A0");
          return;
        }
        textNode.nodeValue = value.replace(/\t/g, "    ");
      });
    });
  }

  async function inlineStylesForClipboard(htmlString) {
    var holder = document.createElement("div");
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText =
      "position:fixed;left:-9999px;top:0;width:578px;max-width:100%;visibility:hidden;pointer-events:none;z-index:-1;";
    holder.innerHTML =
      '<div id="' +
      COPY_ROOT_ID +
      '" class="rich_media_content js_underline_content autoTypeSetting24psection fix_apple_default_style">' +
      htmlString +
      "</div>";
    document.body.appendChild(holder);

    try {
      var root = holder.querySelector("#" + COPY_ROOT_ID) || holder;
      await waitForImages(root);

      var textProps = [
        "color",
        "font-size",
        "font-family",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
        "text-decoration",
        "text-transform",
      ];
      var spacingProps = [
        "display",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "box-sizing",
        "width",
        "max-width",
        "min-width",
      ];
      var textSpacingProps = [
        "display",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "box-sizing",
      ];
      var borderProps = [
        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "border-top-style",
        "border-right-style",
        "border-bottom-style",
        "border-left-style",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "border-radius",
      ];
      var codeWrapProps = ["white-space", "word-break", "word-wrap", "overflow-wrap"];

      normalizeCodeBlocks(root);

      mergeInlineStyle(
        root,
        computedPropsToCss(
          root,
          ["color", "font-size", "font-family", "line-height", "letter-spacing"],
          false
        )
      );

      inlineRule(root, "p", textProps.concat(textSpacingProps), false, "clear:both;min-height:1em;");
      inlineRule(root, "h2, h3, h4, h5, h6", textProps.concat(textSpacingProps), false, "");
      inlineRule(root, "hr", spacingProps.concat(borderProps).concat(["width", "height", "background-color"]), false, "");
      inlineRule(
        root,
        "ul, ol",
        textProps.concat(textSpacingProps).concat(["list-style-type", "list-style-position"]),
        false,
        ""
      );
      inlineRule(root, "li", textProps.concat(textSpacingProps), false, "");
      inlineRule(root, "blockquote", textProps.concat(textSpacingProps).concat(borderProps), false, "");
      inlineRule(
        root,
        "table",
        spacingProps.concat([
          "border-collapse",
          "border-spacing",
          "white-space",
          "overflow-x",
          "text-align",
        ]),
        false,
        ""
      );
      inlineRule(root, "thead, tbody, tr", spacingProps.concat(["background-color"]), true, "");
      inlineRule(root, "th, td", textProps.concat(textSpacingProps).concat(borderProps), false, "");
      inlineRule(
        root,
        "a",
        ["color", "font-weight", "text-decoration", "text-underline-offset"],
        false,
        ""
      );
      inlineRule(
        root,
        "img",
        ["display", "max-width", "border-radius", "box-shadow"],
        false,
        "height:auto;vertical-align:bottom;"
      );
      inlineRule(
        root,
        ".smartmd-figure, .smartmd-title1, .smartmd-title2, .smartmd-lead, .smartmd-include, .smartmd-notice, .smartmd-excerpt, .smartmd-excerpt__head, .smartmd-excerpt__body",
        textProps.concat(spacingProps).concat(borderProps).concat(["background-color", "box-shadow"]),
        true,
        ""
      );
      inlineRule(
        root,
        ".smartmd-title1__text, .smartmd-title2__text, .smartmd-leadin-badge, .smartmd-caption, .smartmd-excerpt__eyebrow, .smartmd-excerpt__title, .smartmd-excerpt__note",
        textProps.concat(spacingProps).concat(borderProps).concat(["background-color"]),
        true,
        ""
      );
      inlineRule(
        root,
        ".smartmd-lead__title-wrap, .smartmd-lead__title-shell, .smartmd-lead__panel, .smartmd-lead__body, .smartmd-include__body",
        textProps.concat(spacingProps).concat(borderProps).concat(["background-color"]),
        true,
        ""
      );
      inlineRule(
        root,
        ".smartmd-lead__title-accent, .smartmd-lead__title-dot",
        spacingProps.concat(borderProps).concat(["background-color", "transform"]),
        true,
        ""
      );
      inlineRule(root, "strong.smartmd-accent", ["color", "font-weight"], false, "");

      root.querySelectorAll("code").forEach(function (code) {
        if (code.closest("pre")) return;
        mergeInlineStyle(
          code,
          computedPropsToCss(
            code,
            [
              "color",
              "font-family",
              "font-size",
              "background-color",
              "padding-top",
              "padding-right",
              "padding-bottom",
              "padding-left",
              "border-radius",
            ],
            true
          )
        );
      });

      root.querySelectorAll(".smartmd-code-wrap").forEach(function (wrap) {
        mergeInlineStyle(
          wrap,
          computedPropsToCss(wrap, ["display", "max-width", "min-width", "width", "box-sizing"], false)
        );
      });

      root.querySelectorAll("pre").forEach(function (pre) {
        mergeInlineStyle(
          pre,
          computedPropsToCss(
            pre,
            [
              "margin",
              "padding",
              "background-color",
              "border-width",
              "border-style",
              "border-color",
              "border-radius",
              "font-size",
              "line-height",
              "overflow-x",
              "max-width",
              "min-width",
              "font-family",
            ],
            false
          )
        );
        mergeInlineStyle(pre, "text-align:left;text-align-last:left;word-spacing:normal;");

        var innerCode = null;
        for (var i = 0; i < pre.children.length; i += 1) {
          if (pre.children[i].tagName === "CODE") {
            innerCode = pre.children[i];
            break;
          }
        }
        if (innerCode) {
          mergeInlineStyle(pre, computedPropsToCss(innerCode, codeWrapProps, false));
        }
      });

      root.querySelectorAll("pre code").forEach(function (code) {
        mergeInlineStyle(
          code,
          computedPropsToCss(
            code,
            ["display", "font-family", "font-size", "width", "box-sizing"]
              .concat(codeWrapProps)
              .concat(["color"]),
            false
          )
        );
        mergeInlineStyle(code, "text-align:left;text-align-last:left;word-spacing:normal;");
      });

      root.querySelectorAll("code[class*='language-']").forEach(function (code) {
        if (code.closest("pre")) return;
        mergeInlineStyle(
          code,
          computedPropsToCss(
            code,
            ["display", "font-family", "font-size", "width", "max-width", "box-sizing"]
              .concat(codeWrapProps)
              .concat(["color"]),
            false
          )
        );
        mergeInlineStyle(code, "text-align:left;text-align-last:left;word-spacing:normal;");
      });

      root.querySelectorAll("pre span").forEach(function (span) {
        mergeInlineStyle(
          span,
          computedPropsToCss(span, ["color", "font-weight", "font-style", "background-color"], true)
        );
      });

      stabilizeCodeWhitespaceForClipboard(root);
      return root.innerHTML;
    } finally {
      if (holder.parentNode) holder.parentNode.removeChild(holder);
    }
  }

  function copyToClipboard(html, plain) {
    return new Promise(function (resolve, reject) {
      var clipboardApi = typeof navigator !== "undefined" ? navigator.clipboard : null;

      function tryExecCommand() {
        var ta = document.createElement("textarea");
        ta.value = plain;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      }

      if (clipboardApi && typeof ClipboardItem !== "undefined") {
        clipboardApi
          .write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" }),
            }),
          ])
          .then(resolve)
          .catch(function (err) {
            console.error("smartmd-copy ClipboardItem", err);
            if (clipboardApi.writeText) {
              clipboardApi
                .writeText(html)
                .then(resolve)
                .catch(function (errHtml) {
                  console.error("smartmd-copy writeText html", errHtml);
                  clipboardApi
                    .writeText(plain)
                    .then(resolve)
                    .catch(function (errPlain) {
                      console.error("smartmd-copy writeText plain", errPlain);
                      if (tryExecCommand()) resolve();
                      else reject(errPlain);
                    });
                });
            } else if (tryExecCommand()) {
              resolve();
            } else {
              reject(err);
            }
          });
        return;
      }

      if (clipboardApi && clipboardApi.writeText) {
        clipboardApi
          .writeText(html)
          .then(resolve)
          .catch(function () {
            clipboardApi
              .writeText(plain)
              .then(resolve)
              .catch(function (err) {
                console.error("smartmd-copy writeText", err);
                if (tryExecCommand()) resolve();
                else reject(err);
              });
          });
        return;
      }

      if (tryExecCommand()) resolve();
      else reject(new Error("execCommand copy failed"));
    });
  }

  function installWechatCopy() {
    var root = document.getElementById(COPY_ROOT_ID);
    var btn = document.getElementById(COPY_BUTTON_ID);
    if (!root || !btn) return;

    normalizeCodeBlocks(root);

    var defaultLabel = (btn.textContent || "").trim() || "复制内容";
    btn.textContent = defaultLabel;

    btn.addEventListener("click", async function () {
      if (btn.dataset.smartmdCopying === "1") return;

      btn.dataset.smartmdCopying = "1";
      var prevDisabled = btn.disabled;
      btn.disabled = true;

      var plain = root.innerText || root.textContent || "";
      var htmlRaw = root.innerHTML;

      try {
        btn.textContent = "打包图片…";
        var htmlFinal = htmlRaw;
        try {
          htmlFinal = await embedImagesInHtml(htmlRaw);
        } catch (embedErr) {
          console.error("smartmd-copy embedImagesInHtml", embedErr);
          htmlFinal = htmlRaw;
        }

        try {
          htmlFinal = await inlineStylesForClipboard(htmlFinal);
        } catch (inlineErr) {
          console.error("smartmd-copy inlineStylesForClipboard", inlineErr);
        }

        await copyToClipboard(htmlFinal, plain);
        btn.textContent = "已复制";
        setTimeout(function () {
          btn.textContent = defaultLabel;
        }, 1500);
      } catch (err) {
        console.error("smartmd-copy", err);
        btn.textContent = "复制失败";
        setTimeout(function () {
          btn.textContent = defaultLabel;
        }, 1500);
      } finally {
        btn.dataset.smartmdCopying = "0";
        btn.disabled = prevDisabled;
      }
    });
  }

  installWechatCopy();
})();
