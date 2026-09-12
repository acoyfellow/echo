<script lang="ts">
  import { onMount } from "svelte";

  type Todo = { id: number; text: string; done: boolean };
  let nextId = 4;
  let draft = $state("Initial draft");
  let todos = $state<Todo[]>([
    { id: 1, text: "Give one tab to an agent", done: true },
    { id: 2, text: "Watch the agent change this app", done: false },
    { id: 3, text: "Press Stop in the Echo companion", done: false },
  ]);

  onMount(() => { document.documentElement.dataset.hydrated = "true"; });

  function addTodo() {
    const text = draft.trim();
    if (!text) return;
    todos = [...todos, { id: nextId++, text, done: false }];
    draft = "";
  }
</script>

<svelte:head>
  <meta name="description" content="A live Todo target for Echo Codemode." />
</svelte:head>

<main class="min-h-svh bg-ink px-5 py-12 text-paper">
  <div class="mx-auto max-w-2xl">
    <nav class="mb-20 flex items-center justify-between text-sm"><a class="text-xl font-semibold no-underline" href="/">echo</a><span class="text-muted">Codemode target</span></nav>
    <p class="font-mono text-xs uppercase tracking-[.16em] text-amber">Live authenticated tab</p>
    <h1 class="mb-4 mt-3 text-[clamp(3.5rem,10vw,6.5rem)] font-semibold leading-[.9] tracking-[-.055em]">Todo</h1>
    <p class="mb-10 max-w-lg text-lg leading-7 text-muted">This is an ordinary client-side app. Approve this tab in the Echo companion, then an MCP agent can inspect and change it with JavaScript.</p>

    <form class="flex gap-3" onsubmit={(event) => { event.preventDefault(); addTodo(); }}>
      <input id="draft" bind:value={draft} aria-label="New todo" class="min-w-0 flex-1 rounded-lg border border-white/15 bg-layer px-4 py-3 text-paper outline-none focus:border-echo" />
      <button class="rounded-lg bg-echo px-5 font-semibold text-black" type="submit">Add</button>
    </form>

    <ul id="todos" class="mt-6 list-none border-t border-white/15 p-0">
      {#each todos as todo (todo.id)}
        <li data-todo-id={todo.id} class="flex items-center gap-4 border-b border-white/10 py-4">
          <input type="checkbox" bind:checked={todo.done} aria-label={`Complete ${todo.text}`} class="size-5 accent-[#ff7a18]" />
          <span class:line-through={todo.done} class:text-muted={todo.done} class="flex-1">{todo.text}</span>
          <button aria-label={`Delete ${todo.text}`} class="text-muted hover:text-danger" onclick={() => todos = todos.filter((candidate) => candidate.id !== todo.id)}>×</button>
        </li>
      {/each}
    </ul>

    <aside class="mt-12 border-l-2 border-amber pl-5 text-sm leading-6 text-muted"><strong class="block text-paper">The security boundary is outside this page.</strong>The Echo companion approves one tab and origin for ten minutes. Stop prevents later execution, but it cannot undo work already completed.</aside>
  </div>
</main>
