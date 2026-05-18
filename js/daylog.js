/**
 * Loads udyamsheel-daylog.md → renders styled entries in #daylog-entries.
 */
(function () {
  const MD_URL = "udyamsheel-daylog.md";
  const container = document.getElementById("daylog-entries");

  if (!container || typeof marked === "undefined") return;

  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  load();

  async function load() {
    try {
      const res = await fetch(MD_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      document.getElementById("daylog-loading")?.remove();

      const entries = parseEntries(md);
      container.replaceChildren();

      if (!entries.length) {
        container.innerHTML =
          '<p class="daylog-status">No day entries found. Add <code>## Day 1 — date</code> sections in udyamsheel-daylog.md.</p>';
        return;
      }

      entries.forEach((entry) => container.appendChild(renderEntry(entry)));
      initReveal();
    } catch (err) {
      console.error("Day log load failed:", err);
      document.getElementById("daylog-loading")?.remove();
      container.innerHTML = `
        <p class="daylog-status daylog-status--error">
          Could not load <code>udyamsheel-daylog.md</code> file. Please check <code>https://github.com/ishwors/ishwors.github.io/blob/master/udyamsheel-daylog.md</code>
        </p>`;
    }
  }

  function parseEntries(md) {
    const stripped = md.replace(/<!--[\s\S]*?-->/g, "");
    const start = stripped.search(/^##\s+Day\s+\d+/im);
    const body = start >= 0 ? stripped.slice(start) : stripped;

    return body
      .split(/\r?\n---\r?\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => /^##\s+Day\s+\d+/i.test(chunk))
      .map(parseEntry)
      .filter(Boolean);
  }

  function parseEntry(chunk) {
    const headerMatch = chunk.match(/^##\s+Day\s+(\d+)\s*[—–-]\s*(.+)$/im);
    if (!headerMatch) return null;

    const day = headerMatch[1];
    const dateLabel = headerMatch[2].trim().replace(/\r$/, "");
    const datetime = toISODate(dateLabel);

    let rest = chunk.replace(/^##\s+Day\s+\d+.*\r?\n?/im, "").trim();
    const titleMatch = rest.match(/^###\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";
    if (titleMatch) rest = rest.replace(/^###\s+.+\r?\n?/m, "").trim();

    return { day, dateLabel, datetime, title, markdown: rest };
  }

  function toISODate(label) {
    const d = new Date(label);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function renderEntry(entry) {
    const article = document.createElement("article");
    article.className = "daylog-entry reveal";
    article.setAttribute("aria-label", `Day ${entry.day}`);

    const marker = document.createElement("aside");
    marker.className = "daylog-marker";
    marker.setAttribute("aria-label", `Day ${entry.day}`);
    marker.innerHTML = `
      <span class="daylog-day">Day ${entry.day}</span>
      <time class="daylog-date" ${entry.datetime ? `datetime="${entry.datetime}"` : ""}>${escapeHtml(entry.dateLabel)}</time>`;

    const content = document.createElement("div");
    content.className = "daylog-content";
    content.innerHTML = `<h2 class="daylog-entry-title">${escapeHtml(entry.title)}</h2>`;

    const body = document.createElement("div");
    body.className = "daylog-prose";
    body.innerHTML = marked.parse(preprocessVideoMarkdown(entry.markdown));

    transformContent(body);
    while (body.firstChild) content.appendChild(body.firstChild);

    wrapConsecutiveFigures(content);
    normalizeMedia(content);
    article.append(marker, content);
    return article;
  }

  function transformContent(root) {
    transformNotes(root);
    transformVideoSlots(root);
    transformVideoLinks(root);
    transformImageBlocks(root);
    wrapOrphanImages(root);
    wrapTables(root);
    styleTaskLists(root);
  }

  /**
   * [![title](thumbnail)](VIDEO_URL) → placeholder (thumbnail ignored on site).
   * Keeps thumbnail in .md for GitHub preview only.
   */
  function preprocessVideoMarkdown(md) {
    return md.replace(
      /\[!\[([^\]]*)\]\([^)]+\)\]\(([^)]+)\)/g,
      (match, title, url) => {
        if (!isVideoUrl(url.trim())) return match;
        const u = escapeAttr(url.trim());
        const t = escapeAttr(title.trim());
        return `\n\n<div class="daylog-video-slot" data-video-url="${u}" data-video-title="${t}"></div>\n\n`;
      }
    );
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function transformVideoSlots(root) {
    root.querySelectorAll(".daylog-video-slot").forEach((slot) => {
      const url = slot.getAttribute("data-video-url") || "";
      let caption = slot.getAttribute("data-video-title") || "";

      let captionSibling = slot.nextElementSibling;
      if (slot.parentElement?.tagName === "P") {
        captionSibling = slot.parentElement.nextElementSibling;
      } else {
        captionSibling = slot.nextElementSibling;
      }

      if (captionSibling?.tagName === "P") {
        const cap = getCaptionText(captionSibling);
        if (cap) {
          caption = cap;
          captionSibling.remove();
        }
      }

      const embed = buildVideoEmbed(url, caption);
      const host =
        slot.parentElement?.tagName === "P" && slot.parentElement.childElementCount === 1
          ? slot.parentElement
          : slot;
      host.replaceWith(embed);
    });
  }

  function transformVideoLinks(root) {
    [...root.querySelectorAll("p")].forEach((p) => {
      if (p.closest(".daylog-figure--embed, .daylog-video-slot")) return;

      const link = p.querySelector("a[href]");
      if (!link) return;

      const href = (link.getAttribute("href") || link.href || "").trim();
      if (!isVideoUrl(href)) return;

      let caption = link.querySelector("img")?.getAttribute("alt") || "";
      const next = p.nextElementSibling;
      if (next?.tagName === "P") {
        const cap = getCaptionText(next);
        if (cap) {
          caption = cap;
          next.remove();
        }
      }

      p.replaceWith(buildVideoEmbed(href, caption));
    });
  }

  function wrapTables(root) {
    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("daylog-table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "daylog-table-wrap";
      table.before(wrap);
      wrap.appendChild(table);
    });
  }

  function transformNotes(root) {
    root.querySelectorAll("blockquote").forEach((bq) => {
      if (!/^note\s*:/i.test(bq.textContent.trim())) return;

      const aside = document.createElement("aside");
      aside.className = "daylog-note";
      aside.innerHTML = '<span class="daylog-note-label">Note</span>';

      bq.querySelectorAll("p").forEach((p) => {
        const clone = p.cloneNode(true);
        const strong = clone.querySelector("strong");
        if (strong && /^note\s*:?\s*$/i.test(strong.textContent.trim())) {
          strong.remove();
        }
        const text = clone.textContent.trim();
        if (!text) return;
        const np = document.createElement("p");
        np.textContent = text;
        aside.appendChild(np);
      });

      if (aside.children.length === 1) {
        const p = document.createElement("p");
        p.textContent = bq.textContent.replace(/^note\s*:\s*/i, "").trim();
        aside.appendChild(p);
      }

      bq.replaceWith(aside);
    });
  }

  function transformImageBlocks(root) {
    let found = true;
    while (found) {
      found = false;
      for (let i = 0; i < root.children.length - 1; i++) {
        const el = root.children[i];
        if (el.tagName !== "P") continue;

        const img = el.querySelector(":scope > img");
        const link = el.querySelector(":scope > a[href]");
        if (link && isVideoUrl(link.getAttribute("href") || link.href || "")) continue;
        if (!img || el.querySelector(":scope > a")) continue;

        const captionEl = root.children[i + 1];
        const caption = getCaptionText(captionEl);
        if (!caption) continue;

        el.replaceWith(buildFigure(img, caption));
        captionEl.remove();
        found = true;
        break;
      }
    }
  }

  function isVideoUrl(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return (
      /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u) ||
      /youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed|youtube-nocookie\.com\/embed/i.test(u) ||
      /vimeo\.com\/(video\/)?\d+/i.test(u)
    );
  }

  function getYouTubeId(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = parsed.pathname.replace(/^\//, "").split("/")[0].split("?")[0];
        return id || null;
      }
      if (host.includes("youtube.com")) {
        if (parsed.pathname.startsWith("/embed/")) {
          return parsed.pathname.split("/")[2] || null;
        }
        return parsed.searchParams.get("v");
      }
    } catch {
      /* fall through to regex */
    }
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/|[?&]v=)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function getVimeoId(url) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    return m ? m[1] : null;
  }

  function getVideoMime(url) {
    if (/\.webm/i.test(url)) return "video/webm";
    if (/\.ogg/i.test(url)) return "video/ogg";
    return "video/mp4";
  }

  function getCaptionText(el) {
    if (!el || el.tagName !== "P") return null;
    const em = el.querySelector(":scope > em");
    if (em && el.textContent.trim() === em.textContent.trim()) {
      return em.textContent.trim();
    }
    return null;
  }

  function buildFigure(mediaEl, captionText) {
    const figure = document.createElement("figure");
    figure.className = "daylog-figure";

    const img = mediaEl.cloneNode(true);
    if (!img.getAttribute("alt")) img.setAttribute("alt", captionText || "");
    figure.appendChild(img);

    if (captionText) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = captionText;
      figure.appendChild(figcaption);
    }
    return figure;
  }

  function buildVideoEmbed(videoUrl, captionText) {
    const figure = document.createElement("figure");
    figure.className = "daylog-figure daylog-figure--embed";

    const wrap = document.createElement("div");
    wrap.className = "daylog-video-wrap";

    const ytId = getYouTubeId(videoUrl);
    const vimeoId = getVimeoId(videoUrl);

    if (ytId && ytId !== "YOUR_VIDEO_ID") {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?rel=0`;
      iframe.title = captionText || "Video";
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      );
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      wrap.appendChild(iframe);
    } else if (vimeoId) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}`;
      iframe.title = captionText || "Video";
      iframe.setAttribute(
        "allow",
        "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
      );
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      wrap.appendChild(iframe);
    } else if (isVideoUrl(videoUrl)) {
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("controlsList", "nodownload");

      const source = document.createElement("source");
      source.src = videoUrl;
      source.type = getVideoMime(videoUrl);
      video.appendChild(source);
      video.appendChild(
        document.createTextNode("Your browser does not support embedded video.")
      );
      wrap.appendChild(video);
    } else {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open video";
      wrap.appendChild(link);
    }

    figure.appendChild(wrap);

    if (captionText) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = captionText;
      figure.appendChild(figcaption);
    }

    return figure;
  }

  function wrapOrphanImages(root) {
    [...root.querySelectorAll("p")].forEach((p) => {
      const link = p.querySelector("a[href]");
      if (link && isVideoUrl(link.getAttribute("href") || link.href || "")) return;

      const img = p.querySelector(":scope > img");
      if (!img || p.querySelector("a")) return;

      const figure = document.createElement("figure");
      figure.className = "daylog-figure";
      figure.appendChild(img.cloneNode(true));
      if (img.getAttribute("alt")) {
        const figcaption = document.createElement("figcaption");
        figcaption.textContent = img.getAttribute("alt");
        figure.appendChild(figcaption);
      }
      p.replaceWith(figure);
    });
  }

  function styleTaskLists(root) {
    root.querySelectorAll("ul").forEach((ul) => {
      if (!ul.querySelector('input[type="checkbox"]')) return;
      ul.classList.add("daylog-tasks");
    });
  }

  function normalizeMedia(root) {
    root.querySelectorAll("img").forEach((img) => {
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.loading = "lazy";
      img.decoding = "async";
    });
  }

  function wrapConsecutiveFigures(container) {
    const children = [...container.children];
    let i = 0;
    while (i < children.length) {
      if (!children[i].classList?.contains("daylog-figure")) {
        i++;
        continue;
      }
      const group = [];
      let j = i;
      while (j < children.length && children[j].classList?.contains("daylog-figure")) {
        group.push(children[j]);
        j++;
      }
      if (group.length > 1) {
        const wrap = document.createElement("div");
        wrap.className = "daylog-figures";
        group[0].before(wrap);
        group.forEach((fig) => wrap.appendChild(fig));
      }
      i = j;
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initReveal() {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".daylog-entry.reveal").forEach((el) => io.observe(el));
  }
})();
