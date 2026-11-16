import { expect, test } from "@playwright/test";

import { scraperSourceWith } from "../src/lib/kdp-bookmarklet";

/**
 * A Bookshelf like KDP's: 10 rows per page until the selector asks for 50,
 * Amazon-style pagination, rows redrawn by the page's scripts after a delay.
 */
const bookshelf = (total: number) => `<!doctype html><html><body>
<select id="refreshedbookshelftable-records-per-page-dropdown-option">
  <option value="10" selected>10</option><option value="50">50</option>
</select>
<table class="refreshedbookshelftable"><tbody></tbody></table>
<ul class="a-pagination"></ul>
<script>
  const TOTAL = ${total};
  let size = 10, page = 1;
  function draw(delay = 300) {
    setTimeout(() => {
      const rows = [];
      for (let i = (page - 1) * size; i < Math.min(page * size, TOTAL); i++) {
        rows.push('<tr id="K' + i + '"><td><div>Libro ' + i + '</div><div>by Autore</div>' +
          '<div>Kindle eBook</div><div>Live</div><div>ASIN: B0' + String(i).padStart(8, "0") + '</div></td></tr>');
      }
      document.querySelector("tbody").innerHTML = rows.join("");
      const pages = Math.ceil(TOTAL / size);
      let html = "";
      for (let p = 1; p <= pages; p++)
        html += '<li class="' + (p === page ? "a-selected" : "a-normal") + '"><a href="#' + p + '">' + p + '</a></li>';
      html += '<li class="a-last' + (page === pages ? " a-disabled" : "") + '"><a href="#next">Next</a></li>';
      document.querySelector(".a-pagination").innerHTML = html;
    }, delay);
  }
  document.querySelector("select").addEventListener("change", (e) => { size = Number(e.target.value); page = 1; draw(); });
  document.querySelector(".a-pagination").addEventListener("click", (e) => {
    const href = e.target.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    page = href === "#next" ? page + 1 : Number(href.slice(1));
    draw();
  });
  draw(0);
</script></body></html>`;

test("the Bookshelf scraper reads every page quickly and reports its progress", async ({
  page,
}) => {
  await page.setContent(bookshelf(120));
  await expect(page.locator("tbody tr")).toHaveCount(10);
  const source = scraperSourceWith({
    deliver: "(hash) => { window.__done = hash; }",
    fail: "(message) => { window.__failed = message; }",
    progress: "(text) => { (window.__progress ||= []).push(text); }",
    onPage: "true",
  });
  const started = Date.now();
  await page.evaluate(source);
  await page.waitForFunction(() => "__done" in window || "__failed" in window, null, {
    timeout: 30_000,
  });
  const seconds = (Date.now() - started) / 1000;

  const { done, failed, progress } = await page.evaluate(() => ({
    done: (window as unknown as { __done?: string }).__done,
    failed: (window as unknown as { __failed?: string }).__failed,
    progress: (window as unknown as { __progress?: string[] }).__progress ?? [],
  }));
  expect(failed).toBeUndefined();
  const json = Buffer.from(done!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  expect(JSON.parse(json).books).toHaveLength(120);
  expect(progress.at(-1)).toMatch(/^Pagina 3 di 3: 120 libri/);
  // 50 rows per page, 3 pages: a few seconds, not the old fixed waits.
  expect(seconds).toBeLessThan(8);
});
