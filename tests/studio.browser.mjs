import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1120, height: 768 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(process.env.SCENE_URL || "http://localhost:5173");
  await page
    .getByRole("button", { name: "Chụp khung hình", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Chụp khung hình"]').disabled,
  );
  const button = (name) => page.getByRole("button", { name, exact: true });
  await button("Tạm dừng").click();
  const stamp = await page.locator(".transport-status b").textContent();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(".transport-status b").textContent(), stamp);
  await page.getByRole("button", { name: /Đêm mưa/ }).click();
  for (const v of ["Tài xế", "Hành khách", "Tự do", "Điện ảnh"]) {
    await button(v).click();
    assert.equal(await button(v).getAttribute("aria-pressed"), "true");
  }
  await button("Chụp khung hình").click();
  await button("Thư viện").click();
  assert.match(
    await page.locator("a[download]").getAttribute("href"),
    /^data:image\/png;base64,/,
  );
  await button("Đóng").click();
  await button("Tham chiếu").click();
  await button("Góc nhìn 02").click();
  await button("Đối chiếu với cảnh 3D").click();
  assert.match(await page.locator(".ref-pane img").getAttribute("src"), /west/);
  await page.keyboard.press("r");
  assert.equal(await page.locator(".ref-pane").count(), 0);
  await page.keyboard.press("h");
  await button("Hiện giao diện · H").click();
  await page.getByRole("button", { name: /TUYẾN 06/ }).click();
  assert.equal(await page.locator(".stops li").count(), 3);
  await page.keyboard.press("Escape");
  await button("Tiếp tục").click();
  await button("Bật âm thanh").click();
  await button("Tắt âm thanh").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await button("Hướng dẫn").click();
  await page.getByRole("heading", { name: "Hướng dẫn điều khiển" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Studio: real frame capture, four lenses, climate, pause, sound, reference split, route, responsive controls OK.",
  );
} finally {
  await browser.close();
}
