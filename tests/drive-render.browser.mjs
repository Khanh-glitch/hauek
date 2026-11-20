import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await b.newPage({ viewport: { width: 700, height: 470 } });
    page.setDefaultTimeout(90000);
    page.on("pageerror", console.error);
    page.on("console", (m) => {
      if (m.text().includes("[init]") || m.text().includes("Shader Error"))
        console.log(m.text().slice(0, 2000));
    });
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          cb(t);
          const c = document.querySelector("canvas");
          if (c && window.takeShot) {
            const snap = document.createElement("canvas");
            snap.width = 320;
            snap.height = 218;
            const ctx = snap.getContext("2d");
            ctx.drawImage(c, 0, 0, 320, 218);
            const data = ctx.getImageData(0, 0, 320, 218).data;
            let bright = 0;
            for (let i = 0; i < data.length; i += 4)
              if (Math.max(data[i], data[i + 1], data[i + 2]) > 55) bright++;
            if (bright > 1600) {
              window.captured = true;
              window.takeShot = false;
            }
          }
        });
    });
    await page.goto(
      process.env.SCENE_URL || "http://localhost:5175/fixed.html",
      { waitUntil: "commit" },
    );
    await page
      .getByRole("button", { name: /VÀO KHU PHỐ/ })
      .click({ force: true });
    for (let i = 0; i < 2; i++) {
      if (i)
        await page
          .getByRole("button", { name: /N8AO Ambient/ })
          .click({ force: true });
      await page.evaluate(() => {
        window.takeShot = true;
        window.captured = null;
      });
      await page.waitForFunction(() => window.captured, {}, { timeout: 40000 });
      console.log("Scene pixels visible, N8AO " + (i ? "off" : "on"));
    }
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
