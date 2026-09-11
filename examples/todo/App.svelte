<script lang="ts">
  import { onMount } from "svelte";
  import { createEcho, type EchoClient } from "../../client";

  type Todo = { id: string; text: string; completed: boolean };
  const defaults: Todo[] = [
    { id: "add-echo", text: "Add Echo to the app", completed: true },
    { id: "connect-agent", text: "Connect an agent", completed: false },
    { id: "finish-list", text: "Let it finish this list", completed: false },
  ];
  let todos = $state<Todo[]>(defaults);
  let draft = $state("");
  let status = $state("Agent disconnected");
  let activity = $state("Only you can change this app.");
  let mcpUrl = $state("");
  let connecting = $state(false);
  let copied = $state(false);
  let echo: EchoClient | undefined;

  function notify(type: string, detail: Record<string, unknown> = {}) {
    if (typeof window !== "undefined" && window.parent !== window) window.parent.postMessage({ source: "echo-example", type, ...detail }, location.origin);
  }

  function persist() {
    localStorage.setItem("echo-tiny-todos", JSON.stringify(todos));
  }

  function addTodo(text: string): Todo {
    const clean = text.trim();
    if (!clean || clean.length > 120) throw new Error("todo_invalid");
    const todo = { id: crypto.randomUUID(), text: clean, completed: false };
    todos = [...todos, todo];
    persist();
    return todo;
  }

  function setCompleted(id: string, completed: boolean): Todo {
    const found = todos.find((todo) => todo.id === id);
    if (!found) throw new Error("todo_not_found");
    const updated = { ...found, completed };
    todos = todos.map((todo) => todo.id === id ? updated : todo);
    persist();
    return updated;
  }

  function deleteTodo(id: string): { deleted: string } {
    if (!todos.some((todo) => todo.id === id)) throw new Error("todo_not_found");
    todos = todos.filter((todo) => todo.id !== id);
    persist();
    return { deleted: id };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    addTodo(draft);
    draft = "";
  }

  async function connect() {
    if (!echo || connecting) return;
    connecting = true;
    status = "Connecting…";
    try {
      const connected = await echo.connect();
      mcpUrl = connected.mcpUrl;
      status = "Agent connected";
      activity = "Four todo tools are ready.";
      notify("connected");
    } catch {
      status = "Connection failed";
    } finally {
      connecting = false;
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }

  function stop() {
    echo?.stop();
    mcpUrl = "";
    status = "Agent disconnected";
    activity = "Only you can change this app.";
    notify("stopped");
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    const saved = localStorage.getItem("echo-tiny-todos");
    if (saved) todos = JSON.parse(saved);
    echo = createEcho({
      workerBase: location.origin,
      appId: "echo-tiny-todo",
      onActivity(event) {
        activity = `${event.status}: ${event.capability}`;
        notify("activity", event);
      },
    });
    echo.register({
      listTodos: {
        description: "List every todo and its completion state",
        effect: "read",
        inputSchema: { type: "object", additionalProperties: false },
        run: () => todos,
      },
      addTodo: {
        description: "Add one todo",
        effect: "mutation",
        inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 120 } }, required: ["text"], additionalProperties: false },
        run: (value) => addTodo((value as { text: string }).text),
      },
      setCompleted: {
        description: "Mark a todo complete or incomplete",
        effect: "mutation",
        inputSchema: { type: "object", properties: { id: { type: "string" }, completed: { type: "boolean" } }, required: ["id", "completed"], additionalProperties: false },
        run: (value) => {
          const request = value as { id: string; completed: boolean };
          return setCompleted(request.id, request.completed);
        },
      },
      deleteTodo: {
        description: "Delete one todo",
        effect: "mutation",
        inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
        run: (value) => deleteTodo((value as { id: string }).id),
      },
    });
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest("#connect")) void connect();
      if (target.closest("#copy")) void copyUrl();
      if (target.closest("#stop")) stop();
      const remove = target.closest<HTMLElement>("[data-delete]");
      if (remove?.dataset.delete) deleteTodo(remove.dataset.delete);
    };
    const submitTodo = (event: SubmitEvent) => {
      if ((event.target as Element).matches("#composer")) submit(event);
    };
    const change = (event: Event) => {
      const checkbox = (event.target as Element).closest<HTMLInputElement>("[data-complete]");
      if (checkbox?.dataset.complete) setCompleted(checkbox.dataset.complete, checkbox.checked);
    };
    document.addEventListener("click", click);
    document.addEventListener("submit", submitTodo);
    document.addEventListener("change", change);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("submit", submitTodo);
      document.removeEventListener("change", change);
      echo?.stop();
    };
  });
</script>

<svelte:head><meta name="description" content="A tiny todo app with four live Echo agent tools." /></svelte:head>

<main class="min-h-svh bg-[radial-gradient(circle_at_15%_0,rgba(255,122,24,.14),transparent_38%),#0b1118] p-0 sm:p-5">
  <section class="mx-auto min-h-svh w-full overflow-hidden border-white/15 bg-layer shadow-2xl sm:min-h-0 sm:max-w-[660px] sm:rounded-2xl sm:border">
    <header class="border-b border-white/10 px-5 pb-5 pt-6"><p class="m-0 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-amber">Tiny todo</p><h1 class="mb-1 mt-2 text-3xl font-black tracking-[-.04em]">Ship Echo</h1><p class="m-0 text-sm text-muted">A real little app with agent tools.</p></header>
    <form id="composer" class="flex gap-2 border-b border-white/10 p-4 sm:px-5"><input bind:value={draft} class="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#182431] px-3 py-3 text-paper outline-none focus:border-[#76c7f0]" placeholder="What needs doing?" maxlength="120" autocomplete="off" /><button class="rounded-lg bg-echo px-4 font-bold text-ink">Add</button></form>
    <section class="min-h-[190px] px-4 py-2">
      {#if todos.length === 0}<p class="py-14 text-center text-muted">Nothing left. Ask your agent what to do next.</p>{/if}
      {#each todos as todo (todo.id)}
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 px-2 py-3 last:border-0">
          <input data-complete={todo.id} aria-label={`Mark ${todo.text} complete`} checked={todo.completed} class="size-5 accent-signal" type="checkbox" />
          <span class:line-through={todo.completed} class:text-muted={todo.completed}>{todo.text}</span>
          <button data-delete={todo.id} aria-label={`Delete ${todo.text}`} type="button" class="bg-transparent px-2 text-xl text-muted hover:text-danger">×</button>
        </div>
      {/each}
    </section>
    <footer class="border-t border-white/10 bg-[#0e161f] p-5">
      <div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div><strong id="status" class="text-sm">{status}</strong><span id="activity" class="block text-xs text-muted">{activity}</span></div><div class="flex w-full gap-2 sm:w-auto">
        {#if !mcpUrl}<button id="connect" type="button" disabled={connecting} class="flex-1 rounded-lg bg-echo px-4 py-2 text-xs font-bold text-ink disabled:opacity-50">Connect agent</button>{:else}<button id="copy" type="button" class="flex-1 rounded-lg bg-[#76c7f0] px-4 py-2 text-xs font-bold text-ink">{copied ? 'Copied' : 'Copy URL'}</button><button id="stop" type="button" class="flex-1 rounded-lg bg-danger px-4 py-2 text-xs font-bold text-ink">Stop</button>{/if}
      </div></div>
      {#if mcpUrl}<code id="session" class="mt-3 block [overflow-wrap:anywhere] rounded-lg bg-[#182431] p-3 font-mono text-[10px] leading-relaxed text-[#76c7f0]">{mcpUrl}</code>{/if}
    </footer>
  </section>
</main>
