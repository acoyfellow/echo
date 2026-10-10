import { z } from "zod";
import { examples } from "../examples/catalog";
import { callCapability, launchChrome, waitFor } from "./cdp";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const namesFor = (slug: string, tools: string[]) => {
  if (slug === "todo") return ["listTodos", "addTodo", "setCompleted", "deleteTodo"];

  if (slug === "notes") return ["readState", "setDraft", "uncertainMutation"];

  return tools.map((tool) => tool.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase()));
};

for (const example of examples) {
  const response = await fetch(`${base}/examples/${example.slug}/`);
  const html = await response.text();

  if (!response.ok || !html.includes(example.name) || !html.includes("/__svelte/"))
    throw new Error(`example_ssr_failed:${example.slug}`);
}

const browser = await launchChrome(`${base}/examples/`);

const { cdp, evaluate } = browser;

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  for (let index = 0; index < examples.length; index += 1) {
    const example = examples[index];
    const previous = examples[(index - 1 + examples.length) % examples.length];
    const next = examples[(index + 1) % examples.length];
    const names = namesFor(example.slug, example.tools);
    console.log(`CHECK: ${example.slug}`);
    await cdp("Page.navigate", { url: `${base}/examples/${example.slug}/` });
    await waitFor(
      browser,
      "document.documentElement.dataset.hydrated === 'true' && !!document.querySelector('#connect')",
    );

    const layout = await evaluate(
      `document.documentElement.scrollWidth <= innerWidth
      && document.querySelector('nav[aria-label="Example navigation"] a:first-child').getAttribute('href') === '/examples/${previous.slug}/'
      && document.querySelector('nav[aria-label="Example navigation"] a:nth-child(2)').getAttribute('href') === '/examples/'
      && document.querySelector('nav[aria-label="Example navigation"] a:last-child').getAttribute('href') === '/examples/${next.slug}/'`,
      z.boolean(),
    );

    if (!layout) throw new Error(`example_layout_failed:${example.slug}`);
    await browser.run("document.querySelector('#connect').click(); true");
    await waitFor(browser, "!!document.querySelector('#session')?.textContent?.startsWith('http')");
    const endpoint = await evaluate("document.querySelector('#session').textContent", z.string());

    const invoked = await callCapability(
      endpoint,
      index * 2 + 1,
      names[0],
      { text: `Played ${example.name}` },
      crypto.randomUUID(),
    );

    if (!invoked.ok) throw new Error(`example_call_failed:${example.slug}:${invoked.error}`);
    await waitFor(
      browser,
      `document.querySelector('#activity').textContent.includes(${JSON.stringify(names[0])})`,
    );
    await browser.run("document.querySelector('#stop').click(); true");

    const stopped = await callCapability(
      endpoint,
      index * 2 + 2,
      names[0],
      {},
      crypto.randomUUID(),
    );

    if (stopped.error !== "session_closed") throw new Error(`example_stop_failed:${example.slug}`);
  }

  console.log(
    "PASS: all 16 examples SSR, hydrate, expose live Echo tools, stop, wrap footer navigation, and fit mobile",
  );
} finally {
  await browser.close();
}
