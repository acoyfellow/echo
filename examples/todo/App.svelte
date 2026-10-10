<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import { createEcho, type EchoClient } from "../../client";
  import ExampleFooter from "../ExampleFooter.svelte";

  type Todo = { id: string; text: string; completed: boolean };

  type Deleted = { deleted: string };

  const todoList = z.array(z.object({ id: z.string(), text: z.string(), completed: z.boolean() }));

  const addInput = z.object({ text: z.string().min(1).max(120) });

  const completeInput = z.object({ id: z.string(), completed: z.boolean() });

  const deleteInput = z.object({ id: z.string() });

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

  function persist() {
    localStorage.setItem("echo-tiny-todos", JSON.stringify(todos));
  }

  function restore(): Todo[] {
    try {
      const parsed = todoList.safeParse(
        JSON.parse(localStorage.getItem("echo-tiny-todos") ?? "null"),
      );

      return parsed.success ? parsed.data : defaults;
    } catch {
      return defaults;
    }
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

    todos = todos.map((todo) => (todo.id === id ? updated : todo));
    persist();

    return updated;
  }

  function deleteTodo(id: string): Deleted {
    if (!todos.some((todo) => todo.id === id)) throw new Error("todo_not_found");
    todos = todos.filter((todo) => todo.id !== id);
    persist();

    return { deleted: id };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();

    if (!draft.trim()) return;
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
    } catch {
      status = "Connection failed";
    } finally {
      connecting = false;
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function stop() {
    echo?.stop();
    mcpUrl = "";
    status = "Agent disconnected";
    activity = "Only you can change this app.";
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    todos = restore();

    echo = createEcho({
      workerBase: location.origin,
      appId: "echo-tiny-todo",
      onActivity(event) {
        activity = `${event.status}: ${event.capability}`;
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
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 120 } },
          required: ["text"],
          additionalProperties: false,
        },
        run: (input) => addTodo(addInput.parse(input).text),
      },
      setCompleted: {
        description: "Mark a todo complete or incomplete",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, completed: { type: "boolean" } },
          required: ["id", "completed"],
          additionalProperties: false,
        },
        run: (input) => {
          const request = completeInput.parse(input);

          return setCompleted(request.id, request.completed);
        },
      },
      deleteTodo: {
        description: "Delete one todo",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        run: (input) => deleteTodo(deleteInput.parse(input).id),
      },
    });

    return () => echo?.stop();
  });
</script>

<svelte:head>
  <meta name="description" content="A tiny todo app with four live Echo agent tools." />
</svelte:head>

<main class="min-h-svh bg-sheet p-0 font-spec text-[14px] text-pen [color-scheme:light]">
  <section class="mx-auto min-h-svh w-full max-w-[680px] px-5 py-5">
    <header class="border-b border-pen pb-3">
      <p class="m-0 text-[12px] text-pen-faint">your app</p>
      <h1 class="mb-0 mt-1 text-[18px] font-bold">todo</h1>
      <p class="m-0 text-[12px] text-pen-soft">an ordinary app with Echo added</p>
    </header>
    <form id="composer" class="flex gap-2 border-b border-pen/30 py-3" onsubmit={submit}>
      <input
        bind:value={draft}
        class="min-w-0 flex-1 border border-pen bg-sheet-deep px-3 py-2 text-[14px] text-pen outline-none placeholder:text-pen-faint focus:bg-sheet"
        placeholder="What needs doing?"
        maxlength="120"
        autocomplete="off"
      />
      <button
        class="border border-pen bg-transparent px-4 text-[13px] font-bold text-pen hover:bg-pen hover:text-sheet"
        >Add</button
      >
    </form>
    <section class="min-h-[170px] py-1">
      {#if todos.length === 0}
        <p class="py-10 text-center text-pen-faint">
          Nothing left. Ask your agent what to do next.
        </p>
      {/if}
      {#each todos as todo (todo.id)}
        <div
          class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-pen/15 py-2.5"
        >
          <input
            data-complete={todo.id}
            aria-label={`Mark ${todo.text} complete`}
            checked={todo.completed}
            onchange={(event) => setCompleted(todo.id, event.currentTarget.checked)}
            class="size-4 accent-pen"
            type="checkbox"
          />
          <span class={todo.completed ? "text-pen-faint line-through" : ""}>{todo.text}</span>
          <button
            data-delete={todo.id}
            aria-label={`Delete ${todo.text}`}
            type="button"
            onclick={() => deleteTodo(todo.id)}
            class="bg-transparent px-2 text-pen-faint hover:text-stop">×</button
          >
        </div>
      {/each}
    </section>
    <footer class="mt-3 border-t border-pen pt-3">
      <div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <strong id="status" class="text-[12px] font-bold tracking-[.04em]">{status}</strong>
          <span id="activity" class="block text-[12px] text-pen-soft">{activity}</span>
        </div>
        <div class="flex w-full gap-2 sm:w-auto">
          {#if !mcpUrl}
            <button
              id="connect"
              type="button"
              disabled={connecting}
              onclick={connect}
              class="flex-1 border border-pen bg-pen px-4 py-2 text-[12px] font-bold text-sheet disabled:opacity-50"
              >Connect agent</button
            >
          {:else}
            <button
              id="copy"
              type="button"
              onclick={copyUrl}
              class="flex-1 border border-pen bg-transparent px-4 py-2 text-[12px] font-bold text-pen"
              >{copied ? "Copied" : "Copy URL"}</button
            >
            <button
              id="stop"
              type="button"
              onclick={stop}
              class="flex-1 border border-stop bg-stop px-4 py-2 text-[12px] font-bold text-sheet"
              >Stop</button
            >
          {/if}
        </div>
      </div>
      {#if mcpUrl}
        <code
          id="session"
          class="mt-3 block [overflow-wrap:anywhere] border-l-2 border-pen bg-sheet-deep px-3 py-2 text-[11px] leading-relaxed"
          >{mcpUrl}</code
        >
      {/if}
    </footer>
    <ExampleFooter slug="todo" />
  </section>
</main>
