<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";

  let frame: HTMLIFrameElement;
  let connected = $state(false);
  let activeTool = $state("");
  let activityStatus = $state("");
  let receipt = $state("WAITING · connect the app, copy its MCP URL, then let your agent call a tool");
  let clearHighlight: ReturnType<typeof setTimeout> | undefined;

  function openAgentLine() {
    const target = frame.contentDocument?.querySelector<HTMLButtonElement>("#connect");
    target?.click();
    receipt = "OPENING · minting one short-lived session for this tab";
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== "echo-example") return;
      if (event.data.type === "connected") {
        connected = true;
        receipt = "CONNECTED · waiting for the first real tool call";
      }
      if (event.data.type === "activity") {
        activeTool = event.data.capability;
        activityStatus = event.data.status;
        receipt = `${event.data.capability.toUpperCase()} · ${event.data.status.toUpperCase()} · THIS CAME THROUGH ECHO`;
        if (clearHighlight) clearTimeout(clearHighlight);
        if (event.data.status !== "started") clearHighlight = setTimeout(() => activeTool = "", 1800);
      }
      if (event.data.type === "stopped") {
        connected = false;
        activeTool = "";
        activityStatus = "";
        receipt = "SESSION CLOSED · the wire is cut";
      }
    };
    const click = (event: MouseEvent) => {
      if ((event.target as Element).closest("#open-line")) openAgentLine();
    };
    window.addEventListener("message", receive);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("message", receive);
      document.removeEventListener("click", click);
    };
  });
</script>

<svelte:head>
  <meta name="description" content="Turn functions in your web app into tools for one user-approved agent session." />
  <meta property="og:title" content="Echo — wire an agent into your web app" />
  <meta property="og:description" content="Turn functions in your web app into tools for one user-approved agent session." />
  <meta property="og:image" content="https://echo.coey.dev/og.svg" />
  <meta property="og:url" content="https://echo.coey.dev/" />
</svelte:head>

<main>
  <section class="relative min-h-svh bg-[radial-gradient(circle_at_50%_0,rgba(255,122,24,.14),transparent_35rem),linear-gradient(rgba(118,199,240,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(118,199,240,.025)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px] p-4 lg:p-5">
    <nav class="relative z-10 mx-auto flex h-14 max-w-[1400px] items-center justify-between">
      <a class="text-xl font-black tracking-[-.05em] text-paper no-underline" href="/">echo</a>
      <div class="flex gap-5 text-xs text-muted"><a href="/examples/">the arcade</a><a href="https://github.com/acoyfellow/echo">source</a></div>
    </nav>

    <header class="relative z-10 mx-auto mb-8 mt-7 max-w-[1160px]">
      <p class="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-amber">The casing is off</p>
      <h1 class="my-4 max-w-[1000px] text-[clamp(3rem,7vw,5.9rem)] font-black leading-[.91] tracking-[-.068em]">Your app already knows what to do. <span class="text-echo">Give those functions to an agent.</span></h1>
      <p class="max-w-2xl text-[clamp(1.05rem,2vw,1.35rem)] text-muted">One live tab. Only the functions you name. Watch a real agent call travel from your code into the app.</p>
    </header>

    <div class="relative z-[2] mx-auto grid w-full max-w-[1400px] grid-cols-1 items-stretch lg:grid-cols-[minmax(0,1fr)_78px_minmax(0,.9fr)]">
      <article class="min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-[#0b1016]/95 shadow-2xl lg:rounded-r-none lg:[transform:perspective(1200px)_rotateY(1.4deg)] lg:[transform-origin:right]">
        <div class="flex h-11 items-center justify-between border-b border-white/15 px-4 font-mono text-[11px] tracking-[.06em] text-muted"><span>YOUR CODE · todo.ts</span><b class="text-signal">● READY</b></div>
        <div class="m-0 max-h-[510px] min-h-[500px] overflow-auto whitespace-pre p-5 font-mono text-[clamp(12px,1.2vw,15px)] leading-[1.8] text-[#d8e5ee] lg:p-9"><span class="block"><span class="text-[#cb8cff]">import</span> &#123; <span class="text-[#82b9ff]">createEcho</span> &#125; <span class="text-[#cb8cff]">from</span> <span class="text-[#b9ef9a]">'@acoyfellow/echo'</span>;</span>
<span class="block"> </span>
<span class="block"><span class="text-[#cb8cff]">const</span> echo = <span class="text-[#82b9ff]">createEcho</span>(&#123;</span>
<span class="block">  <span class="text-amber">appId</span>: <span class="text-[#b9ef9a]">'tiny-todo'</span>,</span>
<span class="block">  <span class="text-amber">workerBase</span>: location.origin,</span>
<span class="block">&#125;);</span>
<span class="block"> </span>
<span class="block">echo.<span class="text-[#82b9ff]">register</span>(&#123;</span>
<span class={`-mx-2 block border-l-2 px-2 transition ${activeTool === 'listTodos' ? 'border-echo bg-echo/10' : 'border-transparent'}`}><span class="text-amber">  listTodos</span>: &#123; <span class="text-amber">effect</span>: <span class="text-[#b9ef9a]">'read'</span>, … &#125;,</span>
<span class={`-mx-2 block border-l-2 px-2 transition ${activeTool === 'addTodo' ? 'border-echo bg-echo/10' : 'border-transparent'}`}><span class="text-amber">  addTodo</span>: &#123; <span class="text-amber">effect</span>: <span class="text-[#b9ef9a]">'mutation'</span>, … &#125;,</span>
<span class={`-mx-2 block border-l-2 px-2 transition ${activeTool === 'setCompleted' ? 'border-echo bg-echo/10' : 'border-transparent'}`}><span class="text-amber">  setCompleted</span>: &#123; <span class="text-amber">effect</span>: <span class="text-[#b9ef9a]">'mutation'</span>, … &#125;,</span>
<span class={`-mx-2 block border-l-2 px-2 transition ${activeTool === 'deleteTodo' ? 'border-echo bg-echo/10' : 'border-transparent'}`}><span class="text-amber">  deleteTodo</span>: &#123; <span class="text-amber">effect</span>: <span class="text-[#b9ef9a]">'mutation'</span>, … &#125;,</span>
<span class="block">&#125;);</span>
<span class="block"> </span>
<span class="block">connectButton.onclick = () =&gt; echo.<span class="text-[#82b9ff]">connect</span>();</span></div>
      </article>

      <div class="relative grid h-14 place-items-center lg:h-auto">
        <div class="absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-echo to-transparent lg:inset-y-0 lg:left-1/2 lg:h-auto lg:w-[3px] lg:-translate-x-1/2 lg:bg-gradient-to-b"></div>
        <div class="relative z-10 grid size-12 place-items-center rounded-full border border-echo bg-ink text-lg font-bold text-echo shadow-[0_0_28px_rgba(255,122,24,.24)]">↯</div>
        <div class:wire-packet-active={activityStatus === 'started'} class="absolute left-1/2 top-[10%] size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-[0_0_8px_white,0_0_24px_#ff7a18,0_0_48px_#ff7a18]"></div>
      </div>

      <article class="min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-[#0b1016]/95 shadow-2xl lg:rounded-l-none lg:[transform:perspective(1200px)_rotateY(-1.4deg)] lg:[transform-origin:left]">
        <div class="flex h-11 items-center justify-between border-b border-white/15 px-4 font-mono text-[11px] tracking-[.06em] text-muted"><span>YOUR APP · LIVE SVELTE</span><b class:text-signal={connected}>{connected ? '● AGENT LINE OPEN' : '● HUMAN ONLY'}</b></div>
        <iframe bind:this={frame} class="block h-[610px] w-full border-0 bg-[#0b1118] lg:h-[550px]" src="/examples/todo/" title="Echo tiny todo" allow="clipboard-write"></iframe>
      </article>
    </div>

    <div class="relative z-10 mx-auto w-[calc(100%_-_24px)] max-w-[900px]"><button id="open-line" class={`w-full cursor-pointer rounded-b-2xl border px-6 py-5 font-black uppercase tracking-[.11em] shadow-[0_16px_50px_rgba(255,122,24,.2)] transition ${connected ? 'border-signal bg-[#10231b] text-signal' : 'border-echo bg-echo text-ink hover:bg-[#ff963f]'}`}>{connected ? 'Agent line open · copy the URL in the app' : 'Connect an agent'}</button></div>
    <div class="relative z-10 mx-auto mt-5 grid max-w-[1160px] gap-4 rounded-lg border border-white/15 bg-[#080c11] px-4 py-3 font-mono text-[11px] text-muted md:grid-cols-[1fr_auto]"><div><strong class:text-danger={receipt.startsWith('SESSION')} class="text-signal">{receipt.split(' · ')[0]}</strong>{receipt.includes(' · ') ? ` · ${receipt.split(' · ').slice(1).join(' · ')}` : ''}</div><div class="text-danger">STOP LIVES INSIDE THE APP</div></div>
  </section>

  <section class="grid min-h-[72svh] place-items-center bg-[radial-gradient(circle,rgba(255,122,24,.12),transparent_33rem)] px-5 py-24 text-center"><div><p class="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-amber">No second act</p><h2 class="m-0 max-w-[950px] text-[clamp(3.1rem,9vw,7.5rem)] font-black leading-[.88] tracking-[-.078em]">That was the whole product.</h2><p class="mx-auto mt-7 max-w-xl text-xl text-muted">A function in your app became a tool in your agent. Its result appeared in the same tab. The app kept the Stop button.</p><pre class="mx-auto mt-8 w-fit rounded-lg border border-white/15 bg-[#080c11] px-6 py-4 text-left font-mono text-signal"><code>npm i github:acoyfellow/echo</code></pre><a class="mt-5 inline-block text-echo" href="https://github.com/acoyfellow/echo#add-echo-to-an-app">See the complete integration →</a></div></section>

  <section class="overflow-hidden border-t border-white/15 bg-[#090d12] py-24"><header class="mx-auto mb-10 w-[calc(100%_-_40px)] max-w-[1160px]"><p class="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-amber">Insert tokens</p><h2 class="my-3 max-w-4xl text-[clamp(2.8rem,7vw,5.2rem)] font-black leading-[.94] tracking-[-.065em]">Little apps. Strange powers.</h2><p class="max-w-2xl text-lg text-muted">Two complete web apps are awake and ready for an agent. Fourteen stranger experiments are still dreaming.</p></header>
    <div class="arcade-drift flex w-max gap-4 px-5 pb-9">
      {#each [...examples, ...examples.slice(0, 6)] as example}
        <svelte:element this={example.live ? 'a' : 'article'} href={example.live ? `/examples/${example.slug}/` : undefined} style={`--accent:${example.color}`} class:opacity-65={!example.live} class="flex h-[390px] w-[285px] flex-col rounded-[18px_18px_9px_9px] border border-[color-mix(in_srgb,var(--accent)_45%,rgba(180,205,225,.15))] bg-[linear-gradient(150deg,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_45%),#111821] p-6 text-paper no-underline shadow-2xl transition hover:-translate-y-2">
          <span class="grid size-14 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-3xl text-[var(--accent)]">{example.emoji}</span>
          <h3 class="mb-2 mt-6 text-2xl font-bold tracking-[-.04em]">{example.name}</h3><p class="m-0 text-sm text-muted">{example.description}</p>
          <div class="mt-5 font-mono text-[10px] uppercase leading-7 text-[var(--accent)]">{example.tools.join(' · ')}</div><b class="mt-auto font-mono text-[11px] uppercase tracking-[.13em] text-[var(--accent)]">{example.live ? 'Insert tokens →' : 'Dreaming'}</b>
        </svelte:element>
      {/each}
    </div>
    <footer class="mx-auto flex w-[calc(100%_-_40px)] max-w-[1160px] justify-between border-t border-white/15 py-8 text-xs text-muted"><span>Echo 0.0.1 · the receipts are part of the product</span><a href="https://github.com/acoyfellow/echo/tree/main/receipts">Read the receipts</a></footer>
  </section>
</main>
