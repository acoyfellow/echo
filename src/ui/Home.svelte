<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";
  import { highlight } from "./highlight";
  import Mark from "./Mark.svelte";

  const phases = ["install", "register", "connect", "live"];

  const phaseMs = [1800, 1800, 1800, 5200];

  let step = $state(4);

  let still = $state(false);

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (still) return;
    let timer: ReturnType<typeof setTimeout>;

    const advance = (next: number) => {
      step = next;
      timer = setTimeout(
        () => advance(next === 4 ? 0 : next + 1),
        next === 0 ? 500 : phaseMs[next - 1],
      );
    };

    advance(0);

    return () => clearTimeout(timer);
  });

  const repository = new URL("acoyfellow/echo", "https:" + "/".repeat(2) + "github.com/");

  const install = highlight(`npm install github:acoyfellow/echo

git clone ${repository.href} && cd echo
npx wrangler secret put ECHO_SIGNING_SECRET
bun run deploy`);

  const tools = [
    { name: "listTodos", effect: "read" },
    { name: "addTodo", effect: "mutation" },
    { name: "setCompleted", effect: "mutation" },
  ];

  const cards = [
    { x: 58, y: 236, author: 0 },
    { x: 150, y: 236, author: 1 },
    { x: 58, y: 286, author: 1 },
    { x: 150, y: 286, author: 0 },
  ];

  const agentColors = ["#1b1a17", "#9b2c1f"];

  type Support = "yes" | "no" | "partial";

  const approaches = ["Echo", "MCP server", "Browser automation", "Browser extension", "WebMCP"];

  const comparison: Array<{ need: string; detail: string; support: Support[] }> = [
    {
      need: "Works on the tab the person has open",
      detail: "Live state, their login, what they see",
      support: ["yes", "no", "partial", "yes", "yes"],
    },
    {
      need: "Agent reaches only the functions you name",
      detail: "Not the whole page, not the whole browser",
      support: ["yes", "yes", "no", "no", "yes"],
    },
    {
      need: "No new backend API to build",
      detail: "Reuse the functions your UI already calls",
      support: ["yes", "no", "yes", "yes", "yes"],
    },
    {
      need: "No install for the person",
      detail: "No extension, no flags, any modern browser",
      support: ["yes", "yes", "partial", "no", "no"],
    },
    {
      need: "One sandboxed script, many calls",
      detail: "Fewer round trips, no network in the sandbox",
      support: ["yes", "no", "no", "no", "no"],
    },
    {
      need: "Several agents at once, applied in order",
      detail: "Calls queue in the tab, one at a time",
      support: ["yes", "partial", "no", "no", "partial"],
    },
    {
      need: "The person can stop it in one click",
      detail: "Revokes every agent's access immediately",
      support: ["yes", "no", "no", "partial", "partial"],
    },
  ];

  const register = highlight(`import { createEcho } from '@acoyfellow/echo';

const echo = createEcho({ appId: 'todo', workerBase });

echo.register({
  listTodos: {
    effect: 'read',
    run: () => todos,
  },
  addTodo: {
    effect: 'mutation',
    run: ({ text }) => add(text),
  },
});

connectButton.onclick = () => echo.connect();
stopButton.onclick = () => echo.stop();`);

  const run = highlight(`// echo_run { runId: 'r1', code: ... }
const todos = await app.listTodos({});

for (const todo of todos) {
  if (!todo.completed) {
    await app.setCompleted({
      id: todo.id,
      completed: true,
    });
  }
}

await app.addTodo({ text: 'Plan the next release' });

return app.listTodos({});`);

  const featured = examples.slice(0, 6);

  const parts = [
    {
      name: "Workers",
      icon: "/icons/cf-workers.svg",
      href: "https://developers.cloudflare.com/workers/",
      text: "Hosts Echo: the session API and the MCP endpoint.",
    },
    {
      name: "Durable Objects",
      icon: "/icons/cf-durable-objects.svg",
      href: "https://developers.cloudflare.com/durable-objects/",
      text: "One per session. Checks each call, records it, and refuses repeats.",
    },
    {
      name: "Dynamic Workers",
      icon: "/icons/cf-dynamic-workers.svg",
      href: "https://developers.cloudflare.com/dynamic-workers/",
      text: "Runs each agent script in a sandbox with no network.",
    },
    {
      name: "Agents SDK and MCP",
      icon: "/icons/cf-agents.svg",
      href: "https://developers.cloudflare.com/agents/model-context-protocol/",
      text: "Gives any MCP client one temporary URL and four tools.",
    },
  ];
</script>

<svelte:head>
  <meta
    name="description"
    content="Echo lets an agent use the functions your web app already has, from the tab a person is using. No extension."
  />
  <meta property="og:title" content="Echo — let an agent use your web app" />
  <meta
    property="og:description"
    content="Register your app's functions. A person connects one tab. The agent sends one sandboxed script. Stop anytime."
  />
</svelte:head>

<div
  class="spec min-h-svh overflow-x-clip bg-[#f4f1ea] font-['Google_Sans_Code',ui-monospace,monospace] text-[14px] leading-[1.7] text-[#1b1a17]"
>
  <div class="mx-auto max-w-[1100px] px-6 pb-6 pt-6">
    <header class="flex items-baseline justify-between pb-3 text-[12px]">
      <span><b>echo</b> 0.0.1</span>
      <span class="flex gap-4"
        ><a
          class="underline decoration-1 underline-offset-2"
          href="https://github.com/acoyfellow/echo">source</a
        ><a class="underline decoration-1 underline-offset-2" href="/examples/">examples</a></span
      >
    </header>
  </div>

  <section class="hero border-y border-[#1b1a17] bg-[#ebe6db]/60">
    <div
      class="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:py-14"
    >
      <div>
        <h1 class="m-0 text-[24px] font-bold leading-[1.3] tracking-[-.01em]">
          Let agents use your web app.
        </h1>
        <p class="mt-3 text-[#4a473f]">One small script, one Cloudflare Worker. Any framework.</p>
        <ol
          class="m-0 mt-6 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]"
          aria-hidden="true"
        >
          {#each phases as phase, index (phase)}
            <li class={step === index + 1 ? "text-[#1b1a17]" : "text-[#8a857a]"}>
              <span class="tick" class:on={step === index + 1}></span>{index + 1}
              {phase}
            </li>
          {/each}
        </ol>
      </div>
      <figure class="stage m-0" class:still data-at={step}>
        <svg
          viewBox="0 0 640 440"
          class="mx-auto block w-full max-w-[880px]"
          fill="none"
          stroke="#1b1a17"
          stroke-width="1.4"
          font-family="Google Sans Code, monospace"
          font-size="13"
          role="img"
          aria-labelledby="stage-title"
        >
          <title id="stage-title"
            >Echo in four steps: install the client and the Worker, register functions, connect
            agents, and watch them work live.</title
          >
          <g class="app">
            <rect x="30" y="30" width="260" height="380" />
            <text x="46" y="54" stroke="none" fill="#8a857a" font-size="12">your app</text>
            <rect x="46" y="222" width="228" height="116" stroke-dasharray="4 3" stroke="#8a857a" />
          </g>

          <g class="script" class:on={step >= 1}>
            <rect x="46" y="356" width="150" height="38" fill="#ebe6db" />
            <text x="60" y="380" stroke="none" fill="#1b1a17">echo client</text>
          </g>

          <g class="worker" class:on={step >= 1}>
            <rect x="370" y="30" width="240" height="120" pathLength="1" class="draw" />
            <text x="386" y="54" stroke="none" fill="#8a857a" font-size="12">cloudflare worker</text
            >
            <rect x="390" y="72" width="200" height="56" fill="#ebe6db" class="fade" />
            <text x="490" y="105" text-anchor="middle" stroke="none" fill="#1b1a17" class="fade"
              >session</text
            >
          </g>

          {#each tools as tool, index (tool.name)}
            <g class="tool" class:on={step >= 2} style:transition-delay={`${index * 120}ms`}>
              <rect x="46" y={72 + index * 46} width="228" height="36" />
              <text x="58" y={95 + index * 46} stroke="none" fill="#1b1a17">{tool.name}</text>
              <text
                x="262"
                y={95 + index * 46}
                text-anchor="end"
                stroke="none"
                fill={tool.effect === "read" ? "#8a857a" : "#9b2c1f"}
                font-size="11">{tool.effect}</text
              >
            </g>
          {/each}

          <path
            class="draw wire"
            class:on={step >= 3}
            pathLength="1"
            d="M196 375 C 330 375, 300 90, 370 90"
          />

          {#each agentColors as color, index (color)}
            <g class="agent" class:on={step >= 3} style:transition-delay={`${300 + index * 200}ms`}>
              <path
                class="draw"
                pathLength="1"
                d={`M490 150 L${425 + index * 130} 320`}
                stroke={color}
              />
              <rect x={370 + index * 130} y="320" width="110" height="64" stroke={color} />
              <text x={430 + index * 120} y="357" text-anchor="middle" stroke="none" fill={color}
                >agent {index === 0 ? "a" : "b"}</text
              >
            </g>
          {/each}

          {#if step >= 4 && !still}
            {#each agentColors as color, index (color)}
              <circle r="4" fill={color} stroke="none">
                <animateMotion
                  dur="2.4s"
                  begin={`${index * 1.2}s`}
                  repeatCount="indefinite"
                  path={`M${425 + index * 130} 320 L490 150 C 300 90, 330 375, 196 375`}
                />
              </circle>
            {/each}
          {/if}

          {#each cards as card, index (index)}
            <rect
              class="card"
              class:on={step >= 4}
              x={card.x}
              y={card.y}
              width="76"
              height="36"
              fill="#f4f1ea"
              stroke={agentColors[card.author]}
              style:animation-delay={`${index * 0.6}s`}
            />
          {/each}
        </svg>
      </figure>
    </div>
  </section>

  <div class="mx-auto max-w-[1100px] px-6 pb-28">
    <section class="mt-14 space-y-14">
      <div class="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <h2 class="m-0 text-[14px] font-bold">1. Install</h2>
          <p class="mt-2 text-[#4a473f]">
            The client goes in your page, any framework. The Worker holds each session; deploy your
            own.
          </p>
        </div>
        <pre
          class="code m-0 min-w-0 overflow-x-auto border-l-2 border-[#1b1a17] bg-[#ebe6db] px-4 py-3 text-[13px] leading-[1.65]">{@html install}</pre>
      </div>
      <div class="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <h2 class="m-0 text-[14px] font-bold">2. Register</h2>
          <p class="mt-2 text-[#4a473f]">
            Name the functions agents may call and mark each read or mutation. Nothing else in the
            page is reachable.
          </p>
        </div>
        <pre
          class="code m-0 min-w-0 overflow-x-auto border-l-2 border-[#1b1a17] bg-[#ebe6db] px-4 py-3 text-[13px] leading-[1.65]">{@html register}</pre>
      </div>
      <div class="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <h2 class="m-0 text-[14px] font-bold">3. Connect, run, stop</h2>
          <p class="mt-2 text-[#4a473f]">
            The person presses Connect and gets one temporary MCP URL for any number of agents. Each
            agent sends a script that runs in a sandbox with no network; calls land in the tab one
            at a time. Stop ends every agent.
          </p>
        </div>
        <pre
          class="code m-0 min-w-0 overflow-x-auto border-l-2 border-[#1b1a17] bg-[#ebe6db] px-4 py-3 text-[13px] leading-[1.65]">{@html run}</pre>
      </div>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section aria-labelledby="compare-title">
      <h2 id="compare-title" class="m-0 text-[14px] font-bold">How it compares</h2>
      <p class="mt-2 max-w-[640px] text-[#4a473f]">
        Ways to let an agent act inside a web app today. A dash means it depends on how you build or
        configure it.
      </p>
      <div class="mt-6 hidden md:block">
        <table id="comparison" class="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr class="border-b border-[#1b1a17]">
              <th scope="col" class="py-3 pr-4 font-normal text-[#8a857a]"></th>
              {#each approaches as approach, index (approach)}
                <th
                  scope="col"
                  class={`px-3 py-3 text-center ${index === 0 ? "bg-[#1b1a17] font-bold text-[#f4f1ea]" : "font-normal"}`}
                  >{approach}</th
                >
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each comparison as row (row.need)}
              <tr class="border-b border-[#1b1a17]/15">
                <th scope="row" class="py-3 pr-4 font-normal">
                  <span class="block">{row.need}</span>
                  <span class="block text-[12px] text-[#8a857a]">{row.detail}</span>
                </th>
                {#each row.support as support, index (index)}
                  <td
                    class={`px-3 py-3 text-center ${index === 0 ? "bg-[#ebe6db]" : ""}`}
                    data-support={support}><Mark {support} /></td
                  >
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <ul class="m-0 mt-6 list-none space-y-4 p-0 md:hidden">
        {#each comparison as row (row.need)}
          <li class="border border-[#1b1a17]/20 bg-[#f4f1ea]">
            <div class="px-4 pb-3 pt-4">
              <span class="block font-bold leading-[1.45]">{row.need}</span>
              <span class="mt-1 block text-[12px] leading-[1.5] text-[#8a857a]">{row.detail}</span>
            </div>
            <div
              class="flex items-center gap-3 border-y border-[#1b1a17]/15 bg-[#ebe6db] px-4 py-3 text-[13px] font-bold"
            >
              <Mark support={row.support[0]} size={22} />{approaches[0]}
            </div>
            <div class="grid grid-cols-2 gap-px bg-[#1b1a17]/10">
              {#each row.support.slice(1) as support, index (index)}
                <div
                  class="flex items-center gap-2.5 bg-[#f4f1ea] px-4 py-3 text-[12px] leading-[1.35] text-[#4a473f]"
                >
                  <span class="shrink-0"><Mark {support} size={18} /></span>{approaches[index + 1]}
                </div>
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section class="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h2 class="m-0 text-[14px] font-bold">Try it here</h2>
        <p class="mt-2 text-[#4a473f]">
          A real todo app with Echo added. Press Connect agent, copy the URL into any MCP client,
          and watch the list change.
        </p>
        <p class="mt-4 text-[#4a473f]">
          Want two agents at once? The
          <a class="underline decoration-1 underline-offset-2" href="/examples/whiteboard/"
            >whiteboard</a
          > lets several draw on one board.
        </p>
      </div>
      <figure class="m-0">
        <div class="border border-[#1b1a17]">
          <iframe
            class="block h-[620px] w-full border-0"
            src="/examples/todo/"
            title="Echo todo example"
          ></iframe>
        </div>
      </figure>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section aria-labelledby="examples-title">
      <div class="flex items-baseline justify-between gap-4">
        <h2 id="examples-title" class="m-0 text-[14px] font-bold">Try it on other apps</h2>
        <a class="text-[12px] underline decoration-1 underline-offset-2" href="/examples/"
          >all 17 examples →</a
        >
      </div>
      <ul
        class="m-0 mt-5 grid list-none grid-cols-1 gap-px bg-[#1b1a17]/15 p-0 sm:grid-cols-2 lg:grid-cols-3"
      >
        {#each featured as example}
          <li class="bg-[#f4f1ea]">
            <a
              class="block h-full px-1 py-4 no-underline sm:px-4 hover:bg-[#ebe6db]"
              href={`/examples/${example.slug}/`}
              ><span class="text-[#8a857a]">{example.emoji}</span>
              <b class="underline decoration-1 underline-offset-2">{example.name}</b><span
                class="mt-1 block text-[#4a473f]">{example.description}</span
              ></a
            >
          </li>
        {/each}
      </ul>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section>
      <h2 class="m-0 text-[14px] font-bold">Built on Cloudflare</h2>
      <ul class="m-0 mt-5 grid list-none grid-cols-1 gap-px bg-[#1b1a17]/15 p-0 sm:grid-cols-2">
        {#each parts as part}
          <li class="bg-[#f4f1ea]">
            <a
              class="grid h-full grid-cols-[40px_1fr] gap-4 px-1 py-5 no-underline sm:px-4 hover:bg-[#ebe6db]"
              href={part.href}
              ><img class="size-8 opacity-90" src={part.icon} alt="" width="32" height="32" /><span
                ><b class="underline decoration-1 underline-offset-2">{part.name}</b><span
                  class="mt-1 block text-[#4a473f]">{part.text}</span
                ></span
              ></a
            >
          </li>
        {/each}
      </ul>
    </section>

    <footer class="mt-20 flex justify-between border-t border-[#1b1a17] pt-3 text-[12px]">
      <span>echo 0.0.1 &middot; MIT</span><a
        class="underline decoration-1 underline-offset-2"
        href="https://github.com/acoyfellow/echo">github.com/acoyfellow/echo</a
      >
    </footer>
  </div>
</div>

<style>
  .tick {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 6px;
    border: 1px solid currentColor;
    vertical-align: 1px;
  }
  .tick.on {
    background: #9b2c1f;
    border-color: #9b2c1f;
  }
  .stage :global(*) {
    transition:
      opacity 0.6s ease,
      transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),
      stroke-dashoffset 0.9s ease;
  }
  .stage .script {
    opacity: 0;
    transform: translateY(-40px);
  }
  .stage .script.on {
    opacity: 1;
    transform: none;
  }
  .stage .draw {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
  }
  .stage .on .draw,
  .stage .draw.on {
    stroke-dashoffset: 0;
  }
  .stage .worker .fade {
    opacity: 0;
  }
  .stage .worker.on .fade {
    opacity: 1;
    transition-delay: 0.5s;
  }
  .stage .tool {
    opacity: 0;
    transform: translateX(-14px);
  }
  .stage .tool.on {
    opacity: 1;
    transform: none;
  }
  .stage .agent {
    opacity: 0;
  }
  .stage .agent.on {
    opacity: 1;
  }
  .stage .card {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
  }
  .stage .card.on {
    animation: land 4.8s ease infinite both;
  }
  .stage.still .card.on {
    animation: none;
    opacity: 1;
  }
  .stage.still :global(*) {
    transition: none;
  }
  @keyframes land {
    0% {
      opacity: 0;
      transform: scale(0.6);
    }
    8%,
    80% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage :global(*) {
      transition: none !important;
      animation: none !important;
    }
    .stage .card.on {
      opacity: 1;
    }
  }
  .code :global(.tok-keyword) {
    color: #8a2d6b;
  }
  .code :global(.tok-string) {
    color: #3d6b1f;
  }
  .code :global(.tok-comment) {
    color: #8a857a;
    font-style: italic;
  }
  .code :global(.tok-number) {
    color: #9b4a10;
  }
  .code :global(.tok-function) {
    color: #1f4f8a;
  }
  .code :global(.tok-property) {
    color: #9b4a10;
  }
  .code :global(.tok-punctuation) {
    color: #6b675d;
  }
</style>
