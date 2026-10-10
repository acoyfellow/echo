<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";
  import { highlight } from "./highlight";

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
  });

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
  class="spec min-h-svh overflow-x-hidden bg-[#f4f1ea] font-['Google_Sans_Code',ui-monospace,monospace] text-[14px] leading-[1.7] text-[#1b1a17]"
>
  <div class="mx-auto max-w-[1100px] px-6 pb-28 pt-6">
    <header class="flex items-baseline justify-between border-b border-[#1b1a17] pb-3 text-[12px]">
      <span><b>echo</b> 0.0.1</span>
      <span class="flex gap-4"
        ><a
          class="underline decoration-1 underline-offset-2"
          href="https://github.com/acoyfellow/echo">source</a
        ><a class="underline decoration-1 underline-offset-2" href="/examples/">examples</a></span
      >
    </header>

    <section
      class="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start"
    >
      <figure class="m-0">
        <svg
          viewBox="0 0 640 520"
          class="w-full"
          fill="none"
          stroke="#1b1a17"
          stroke-width="1.4"
          font-family="Google Sans Code, monospace"
          font-size="13"
          role="img"
          aria-labelledby="fig1-title"
        >
          <title id="fig1-title"
            >Echo architecture: the web app's Echo client connects to a session; agent scripts run
            in a sandbox whose only binding is the session.</title
          >
          <rect x="30" y="40" width="250" height="300" />
          <rect x="50" y="70" width="210" height="190" stroke-dasharray="4 3" />
          <text x="155" y="170" text-anchor="middle" stroke="none" fill="#1b1a17">app UI</text>
          <rect x="50" y="280" width="210" height="40" />
          <text x="155" y="305" text-anchor="middle" stroke="none" fill="#1b1a17">echo client</text>
          <rect x="370" y="60" width="230" height="110" />
          <text x="485" y="120" text-anchor="middle" stroke="none" fill="#1b1a17">session</text>
          <rect x="370" y="230" width="230" height="110" stroke-dasharray="7 4" />
          <text x="485" y="290" text-anchor="middle" stroke="none" fill="#1b1a17">sandbox</text>
          <rect x="370" y="410" width="230" height="70" />
          <text x="485" y="450" text-anchor="middle" stroke="none" fill="#1b1a17">agent</text>
          <path d="M260 300 C 320 300, 320 115, 370 115" />
          <path d="M485 170 L485 230" />
          <path d="M485 340 L485 410" />
          <path d="M478 178 L485 170 L492 178" />
          <path d="M478 348 L485 340 L492 348" />
          <path d="M268 293 L260 300 L268 307" />
          <g stroke-width="1" font-size="12">
            <path d="M30 40 L10 20" /><text x="0" y="16" stroke="none" fill="#1b1a17">10</text>
            <path d="M260 320 L290 360" /><text x="292" y="374" stroke="none" fill="#1b1a17"
              >20</text
            >
            <path d="M600 60 L620 40" /><text x="614" y="36" stroke="none" fill="#1b1a17">30</text>
            <path d="M600 340 L625 360" /><text x="618" y="376" stroke="none" fill="#1b1a17"
              >40</text
            >
            <path d="M370 480 L345 500" /><text x="322" y="512" stroke="none" fill="#1b1a17"
              >50</text
            >
          </g>
        </svg>
        <figcaption
          class="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[12px] text-[#4a473f]"
        >
          <span><b class="text-[#1b1a17]">10</b> your app</span><span
            ><b class="text-[#1b1a17]">20</b> echo client</span
          ><span><b class="text-[#1b1a17]">30</b> session</span><span
            ><b class="text-[#1b1a17]">40</b> sandbox</span
          ><span><b class="text-[#1b1a17]">50</b> agent</span>
        </figcaption>
      </figure>

      <div>
        <h1 class="m-0 text-[22px] font-bold leading-[1.35] tracking-[-.01em]">
          Echo lets an agent use the functions your web app already has.
        </h1>
        <p class="mt-4 text-[#4a473f]">
          A person connects one tab. The agent gets a temporary MCP address and sends a script,
          which runs in a sandbox that can reach only those functions. The person can stop it at any
          time.
        </p>
        <pre class="code mt-6 overflow-x-auto bg-[#ebe6db] px-4 py-3 text-[13px]"><span
            class="tok-punctuation">$</span
          > npm install github:acoyfellow/echo</pre>
      </div>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div class="min-w-0">
        <h2 class="m-0 text-[14px] font-bold">1. Register</h2>
        <p class="mt-2 text-[#4a473f]">
          Name the functions an agent may call. Mark each one read or mutation.
        </p>
        <pre
          class="code mt-4 overflow-x-auto border-l-2 border-[#1b1a17] bg-[#ebe6db] px-4 py-3 text-[13px] leading-[1.65]">{@html register}</pre>

        <h2 class="mb-0 mt-12 text-[14px] font-bold">2. Run</h2>
        <p class="mt-2 text-[#4a473f]">
          The agent sends one script instead of one tool call per step.
        </p>
        <pre
          class="code mt-4 overflow-x-auto border-l-2 border-[#1b1a17] bg-[#ebe6db] px-4 py-3 text-[13px] leading-[1.65]">{@html run}</pre>
      </div>

      <figure class="m-0">
        <div class="border border-[#1b1a17]">
          <iframe
            class="block h-[620px] w-full border-0"
            src="/examples/todo/"
            title="Echo todo example"
          ></iframe>
        </div>
        <figcaption class="mt-2 text-center text-[12px]">
          A real todo app with Echo added. Press Connect agent.
        </figcaption>
      </figure>
    </section>

    <hr class="my-14 border-0 border-t border-[#1b1a17]" />

    <section aria-labelledby="examples-title">
      <div class="flex items-baseline justify-between gap-4">
        <h2 id="examples-title" class="m-0 text-[14px] font-bold">Try it on other apps</h2>
        <a class="text-[12px] underline decoration-1 underline-offset-2" href="/examples/"
          >all 16 examples →</a
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
