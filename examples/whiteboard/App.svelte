<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import { createEcho, type EchoClient } from "../../client";
  import ExampleFooter from "../ExampleFooter.svelte";

  type Card = {
    id: string;
    kind: "box" | "note";
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    author: string;
  };

  type Arrow = { id: string; from: string; to: string; author: string };

  type Cursor = { author: string; x: number; y: number };

  const boardWidth = 960;

  const boardHeight = 600;

  const authorName = z.string().trim().min(1).max(24);

  const coordinate = z.number().finite();

  const addCardInput = z.object({
    kind: z.enum(["box", "note"]).default("box"),
    x: coordinate.min(0).max(boardWidth),
    y: coordinate.min(0).max(boardHeight),
    w: coordinate.min(20).max(400).default(140),
    h: coordinate.min(20).max(300).default(60),
    text: z.string().max(80).default(""),
    author: authorName,
  });

  const connectInput = z.object({ from: z.string(), to: z.string(), author: authorName });

  const moveInput = z.object({ id: z.string(), x: coordinate, y: coordinate, author: authorName });

  const deleteInput = z.object({ id: z.string(), author: authorName });

  const palette = ["#1b1a17", "#9b2c1f", "#2f5d8a", "#4f6b2d", "#7a4a8c"];

  let cards = $state<Card[]>([]);

  let arrows = $state<Arrow[]>([]);

  let cursors = $state<Cursor[]>([]);

  let authors = $state<string[]>(["you"]);

  let status = $state("Agent disconnected");

  let activity = $state("Only you can draw on this board.");

  let mcpUrl = $state("");

  let connecting = $state(false);

  let copied = $state(false);

  let dragging = $state<{ id: string; dx: number; dy: number } | undefined>();

  let nextCard = 1;

  let nextArrow = 1;

  let echo: EchoClient | undefined;

  const colorOf = (author: string) => {
    const index = authors.indexOf(author);

    return palette[(index < 0 ? 0 : index) % palette.length];
  };

  const centerOf = (card: Card) => ({ x: card.x + card.w / 2, y: card.y + card.h / 2 });

  function edgePoint(from: Card, to: Card) {
    const start = centerOf(from);
    const end = centerOf(to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const scale = Math.min(
      dx === 0 ? Infinity : to.w / 2 / Math.abs(dx),
      dy === 0 ? Infinity : to.h / 2 / Math.abs(dy),
    );

    return { x: end.x - dx * scale, y: end.y - dy * scale };
  }

  function arrowPath(arrow: Arrow): string {
    const from = cards.find((card) => card.id === arrow.from);
    const to = cards.find((card) => card.id === arrow.to);

    if (!from || !to) return "";
    const start = centerOf(from);
    const end = edgePoint(from, to);

    return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  }

  function touch(author: string, x: number, y: number) {
    if (!authors.includes(author)) authors = [...authors, author];
    cursors = [...cursors.filter((cursor) => cursor.author !== author), { author, x, y }];
  }

  function findCard(id: string): Card {
    const card = cards.find((candidate) => candidate.id === id);

    if (!card) throw new Error("card_not_found");

    return card;
  }

  function addCard(input: z.infer<typeof addCardInput>): Card {
    if (cards.length >= 200) throw new Error("board_full");
    const card = { id: `s${nextCard++}`, ...input };

    cards = [...cards, card];
    touch(input.author, input.x + input.w, input.y + input.h);

    return card;
  }

  function connectCards(input: z.infer<typeof connectInput>): Arrow {
    const from = findCard(input.from);
    const to = findCard(input.to);

    if (from.id === to.id) throw new Error("arrow_self");
    const arrow = { id: `a${nextArrow++}`, ...input };

    arrows = [...arrows, arrow];
    const end = centerOf(to);

    touch(input.author, end.x, end.y);

    return arrow;
  }

  function moveCard(input: z.infer<typeof moveInput>): Card {
    const moved = { ...findCard(input.id), x: input.x, y: input.y };

    cards = cards.map((card) => (card.id === input.id ? moved : card));
    touch(input.author, input.x, input.y);

    return moved;
  }

  function deleteCard(id: string) {
    findCard(id);
    cards = cards.filter((card) => card.id !== id);
    arrows = arrows.filter((arrow) => arrow.from !== id && arrow.to !== id);

    return { deleted: id };
  }

  function snapshot() {
    return { width: boardWidth, height: boardHeight, cards, arrows, authors };
  }

  function boardElement(): SVGSVGElement | undefined {
    const element = document.getElementById("board");

    return element instanceof SVGSVGElement ? element : undefined;
  }

  function boardPoint(event: MouseEvent) {
    const rect = boardElement()?.getBoundingClientRect();

    if (!rect) return { x: 0, y: 0 };

    return {
      x: ((event.clientX - rect.left) / rect.width) * boardWidth,
      y: ((event.clientY - rect.top) / rect.height) * boardHeight,
    };
  }

  function startDrag(event: PointerEvent, card: Card) {
    const point = boardPoint(event);

    dragging = { id: card.id, dx: point.x - card.x, dy: point.y - card.y };
    boardElement()?.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent) {
    if (!dragging) return;
    const point = boardPoint(event);

    moveCard({
      id: dragging.id,
      x: point.x - dragging.dx,
      y: point.y - dragging.dy,
      author: "you",
    });
  }

  function addByHand(event: MouseEvent) {
    if (event.target !== boardElement()) return;
    const point = boardPoint(event);

    addCard({
      kind: "note",
      x: Math.max(0, point.x - 70),
      y: Math.max(0, point.y - 30),
      w: 140,
      h: 60,
      text: "note",
      author: "you",
    });
  }

  function addFromKeyboard(event: KeyboardEvent) {
    if (event.key !== "n") return;
    addCard({
      kind: "note",
      x: boardWidth / 2 - 70,
      y: boardHeight / 2 - 30,
      w: 140,
      h: 60,
      text: "note",
      author: "you",
    });
  }

  async function connect() {
    if (!echo || connecting) return;
    connecting = true;
    status = "Connecting…";

    try {
      mcpUrl = (await echo.connect()).mcpUrl;
      status = "Agent connected";
      activity = "Agents can draw. Each one signs its cards.";
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
    cursors = [];
    status = "Agent disconnected";
    activity = "Only you can draw on this board.";
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";

    echo = createEcho({
      workerBase: location.origin,
      appId: "echo-whiteboard",
      onActivity(event) {
        activity = `${event.status}: ${event.capability}`;
      },
    });

    const author = {
      type: "string",
      maxLength: 24,
      description: "Your name. Cards are colored by author.",
    };

    echo.register({
      readBoard: {
        description: `Read every card and arrow. The board is ${boardWidth}x${boardHeight}.`,
        effect: "read",
        inputSchema: { type: "object", additionalProperties: false },
        run: () => snapshot(),
      },
      addCard: {
        description: "Draw a box or sticky note. Returns the card with its id.",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: {
            kind: { enum: ["box", "note"] },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            text: { type: "string", maxLength: 80 },
            author,
          },
          required: ["x", "y", "author"],
          additionalProperties: false,
        },
        run: (input) => addCard(addCardInput.parse(input)),
      },
      connectCards: {
        description: "Draw an arrow from one card to another.",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" }, author },
          required: ["from", "to", "author"],
          additionalProperties: false,
        },
        run: (input) => connectCards(connectInput.parse(input)),
      },
      moveCard: {
        description: "Move a card's top-left corner.",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            author,
          },
          required: ["id", "x", "y", "author"],
          additionalProperties: false,
        },
        run: (input) => moveCard(moveInput.parse(input)),
      },
      deleteCard: {
        description: "Delete a card and its arrows.",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, author },
          required: ["id", "author"],
          additionalProperties: false,
        },
        run: (input) => deleteCard(deleteInput.parse(input).id),
      },
    });

    return () => echo?.stop();
  });
</script>

<svelte:head>
  <meta name="description" content="A whiteboard that several agents can draw on at once." />
</svelte:head>

<main class="min-h-svh bg-sheet font-spec text-[14px] text-pen [color-scheme:light]">
  <section class="mx-auto w-full max-w-[1000px] px-5 py-5">
    <header class="flex flex-wrap items-end justify-between gap-3 border-b border-pen pb-3">
      <div>
        <p class="m-0 text-[12px] text-pen-faint">your app</p>
        <h1 class="mb-0 mt-1 text-[18px] font-bold">whiteboard</h1>
        <p class="m-0 text-[12px] text-pen-soft">
          several agents, one board. click empty space (or press n) to add a note, drag to move.
        </p>
      </div>
      <ul id="authors" class="m-0 flex list-none flex-wrap gap-3 p-0 text-[12px]">
        {#each authors as name (name)}
          <li data-author={name} class="flex items-center gap-1.5">
            <span class="inline-block size-2.5" style:background={colorOf(name)}></span>{name}
          </li>
        {/each}
      </ul>
    </header>

    <svg
      id="board"
      viewBox={`0 0 ${boardWidth} ${boardHeight}`}
      role="button"
      aria-label="Whiteboard. Click or press n to add a note."
      class="mt-4 block aspect-[8/5] w-full touch-none select-none border border-pen bg-sheet-deep"
      tabindex="0"
      onclick={addByHand}
      onkeydown={addFromKeyboard}
      onpointermove={drag}
      onpointerup={() => (dragging = undefined)}
    >
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#1b1a17" stroke-opacity=".07" />
        </pattern>
        {#each authors as name (name)}
          <marker
            id={`head-${authors.indexOf(name)}`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill={colorOf(name)} />
          </marker>
        {/each}
      </defs>
      <rect width={boardWidth} height={boardHeight} fill="url(#grid)" pointer-events="none" />
      {#each arrows as arrow (arrow.id)}
        <path
          data-arrow={arrow.id}
          data-author={arrow.author}
          d={arrowPath(arrow)}
          fill="none"
          stroke={colorOf(arrow.author)}
          stroke-width="1.5"
          marker-end={`url(#head-${authors.indexOf(arrow.author)})`}
        />
      {/each}
      {#each cards as card (card.id)}
        <g
          data-card={card.id}
          data-author={card.author}
          class="cursor-grab"
          role="button"
          tabindex="-1"
          aria-label={card.text || card.id}
          onpointerdown={(event) => startDrag(event, card)}
        >
          <rect
            x={card.x}
            y={card.y}
            width={card.w}
            height={card.h}
            fill={card.kind === "note" ? "#f4e7b8" : "#f4f1ea"}
            stroke={colorOf(card.author)}
            stroke-width="1.5"
          />
          <text
            x={card.x + card.w / 2}
            y={card.y + card.h / 2}
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="13"
            fill="#1b1a17">{card.text}</text
          >
          <text x={card.x + 4} y={card.y - 4} font-size="10" fill={colorOf(card.author)}
            >{card.id}</text
          >
        </g>
      {/each}
      {#each cursors as cursor (cursor.author)}
        <g
          data-cursor={cursor.author}
          style:transform={`translate(${cursor.x}px, ${cursor.y}px)`}
          class="pointer-events-none transition-transform duration-300"
        >
          <path d="M0 0L0 16L4.5 12L8 19L10.5 18L7 11L13 11z" fill={colorOf(cursor.author)} />
          <text x="15" y="20" font-size="11" fill={colorOf(cursor.author)}>{cursor.author}</text>
        </g>
      {/each}
    </svg>

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
              >Connect agents</button
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
          class="mt-3 block [overflow-wrap:anywhere] border-l-2 border-pen bg-sheet px-3 py-2 text-[11px] leading-relaxed"
          >{mcpUrl}</code
        >
      {/if}
    </footer>
    <ExampleFooter slug="whiteboard" />
  </section>
</main>
