import { z } from "zod";
import { callCapability, launchChrome, waitFor } from "./cdp";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const routes = [
  ["/", "Echo lets an agent use the functions your web app already has."],
  ["/examples/", "Sixteen small apps with Echo added."],
  ["/examples/todo/", "an ordinary app with Echo added"],
  ["/examples/notes/", "Quarterly notes"],
] as const;

for (const [path, text] of routes) {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();

  if (!response.ok || !html.includes(text) || !html.includes("/__svelte/"))
    throw new Error(`ssr_failed:${path}`);
}

const browser = await launchChrome(`${base}/`);

const { cdp, evaluate } = browser;

async function verifyCodeBlocks(label: string) {
  const valid = await evaluate(
    `(() => {
    const blocks = [...document.querySelectorAll('pre.code')];
    return blocks.length === 3
      && blocks.filter((block) => block.querySelector('.tok-keyword')).length === 2
      && blocks.every((block) => block.getBoundingClientRect().right <= innerWidth + 1);
  })()`,
    z.boolean(),
  );

  if (!valid) throw new Error(`site_code_blocks_invalid:${label}`);
}

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(
    browser,
    "document.documentElement.dataset.hydrated === 'true' && !!document.querySelector('iframe')",
  );
  await verifyCodeBlocks("desktop");

  const homeLinks = await evaluate(
    "document.querySelectorAll('a[href=\"/examples/\"]').length >= 2 && document.querySelectorAll('section[aria-labelledby=\"examples-title\"] li a').length === 6 && document.querySelectorAll('img[src^=\"/icons/cf-\"]').length === 4",
    z.boolean(),
  );

  if (!homeLinks) throw new Error("site_home_links_missing");
  await waitFor(
    browser,
    "document.querySelector('iframe')?.contentDocument?.documentElement.dataset.hydrated === 'true' && !!document.querySelector('iframe')?.contentDocument?.querySelector('#connect')",
  );
  await browser.run("frames[0].document.querySelector('#connect').click(); true");
  await waitFor(
    browser,
    "frames[0].document.querySelector('#status')?.textContent === 'Agent connected'",
  );

  const endpoint = await evaluate(
    "frames[0].document.querySelector('#session').textContent",
    z.string(),
  );

  const listed = await callCapability(endpoint, 1, "listTodos", {});

  if (!listed.ok) throw new Error("site_echo_list_failed");
  const text = `Hydrated through Echo ${Date.now()}`;
  const added = await callCapability(endpoint, 2, "addTodo", { text }, crypto.randomUUID());

  if (!added.ok) throw new Error("site_echo_add_failed");
  await waitFor(browser, `frames[0].document.body.textContent.includes(${JSON.stringify(text)})`);
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await Bun.sleep(300);

  const responsive = await evaluate(
    "document.documentElement.scrollWidth <= innerWidth && frames[0].document.documentElement.scrollWidth <= frames[0].innerWidth",
    z.boolean(),
  );

  if (!responsive) throw new Error("site_mobile_overflow");
  await browser.run("frames[0].document.querySelector('#stop').click(); true");
  await Bun.sleep(500);
  const afterStop = await callCapability(endpoint, 3, "listTodos", {});

  if (afterStop.error !== "session_closed") throw new Error("site_stop_failed");
  await cdp("Page.navigate", { url: `${base}/examples/` });
  await waitFor(
    browser,
    "document.documentElement.dataset.hydrated === 'true' && document.querySelectorAll('section[aria-labelledby=\"more-title\"] a').length === 14",
  );

  const examplesResponsive = await evaluate(
    "document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll('section[aria-labelledby=\"live-title\"] a').length === 2 && document.querySelectorAll('main a[href^=\"/examples/\"]').length === 16",
    z.boolean(),
  );

  if (!examplesResponsive) throw new Error("examples_mobile_overflow");
  console.log(
    "PASS: SSR, hydration, highlighted code, examples links, Cloudflare icons, real Echo MCP mutation, mobile fit, and Stop",
  );
} finally {
  await browser.close();
}
