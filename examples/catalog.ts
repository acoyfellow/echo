export type EchoExample = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  tools: string[];
  live: boolean;
  color: string;
};

export const examples: EchoExample[] = [
  { slug: "todo", name: "Tiny Todo", emoji: "✓", description: "The full-stack hello world. Let an agent run the list while you watch.", prompt: "Finish my list and add one thing I forgot.", tools: ["list", "add", "complete", "delete"], live: true, color: "#f6821f" },
  { slug: "notes", name: "Live Notes", emoji: "✎", description: "Share a draft, not the whole browser. Read it, rewrite it, stop access.", prompt: "Tighten this note without changing my voice.", tools: ["read", "rewrite"], live: true, color: "#71b8d8" },
  { slug: "tiny-dungeon", name: "Tiny Dungeon", emoji: "⚔", description: "A six-room adventure where the agent plays dungeon master and the page keeps score.", prompt: "Surprise me. Make the next room dangerous.", tools: ["reveal room", "spawn monster", "award loot"], live: false, color: "#c792ea" },
  { slug: "joke-lab", name: "Joke Lab", emoji: "☺", description: "Build, rate, and mercilessly improve one joke until it earns a laugh.", prompt: "Workshop this premise. Be brutal but useful.", tools: ["read premise", "add punchline", "rate laugh"], live: false, color: "#f7b53b" },
  { slug: "pixel-pet", name: "Pixel Pet", emoji: "◆", description: "A tiny creature with needs, moods, and a suspicious amount of personality.", prompt: "Keep Momo happy while I am away.", tools: ["check mood", "feed", "play", "rename"], live: false, color: "#63d5a2" },
  { slug: "copy-roast", name: "Copy Roast", emoji: "♨", description: "Put landing-page copy on stage. The agent heckles it, then writes a better version.", prompt: "Roast this hero, then earn the right to rewrite it.", tools: ["read copy", "roast", "rewrite", "pick winner"], live: false, color: "#ff7d68" },
  { slug: "decision-wheel", name: "Decision Wheel", emoji: "◉", description: "Load the options, expose the tradeoffs, and let an agent spin the final answer.", prompt: "Challenge my options, add one wildcard, then spin.", tools: ["list options", "add option", "spin"], live: false, color: "#82aaff" },
  { slug: "meeting-bingo", name: "Meeting Bingo", emoji: "▦", description: "A live board for synergy, circles back, hard stops, and everything in between.", prompt: "Mark ‘let’s take this offline’ and give me the score.", tools: ["read board", "mark square", "call bingo"], live: false, color: "#ffcb6b" },
  { slug: "mixtape", name: "Mixtape Alchemist", emoji: "♫", description: "Turn a mood and a handful of tracks into a tiny sequenced mixtape.", prompt: "Make this feel like driving home after a perfect night.", tools: ["list tracks", "add track", "reorder", "name tape"], live: false, color: "#f07178" },
  { slug: "story-dice", name: "Story Dice", emoji: "⚄", description: "Roll characters, places, and trouble. The agent turns the chaos into a story.", prompt: "Roll three times and open with a sentence I cannot ignore.", tools: ["roll dice", "pin detail", "write scene"], live: false, color: "#c3e88d" },
  { slug: "trivia-night", name: "Trivia Night", emoji: "?", description: "The page owns the scoreboard. The agent becomes an adaptive, slightly dramatic host.", prompt: "Give me five weird web-history questions. Keep score.", tools: ["ask", "reveal", "score", "next round"], live: false, color: "#89ddff" },
  { slug: "recipe-remix", name: "Recipe Remix", emoji: "✦", description: "A pantry, a recipe card, and an agent that must work with what is actually there.", prompt: "Make dinner from this pantry in under 25 minutes.", tools: ["read pantry", "add ingredient", "write recipe"], live: false, color: "#ff9cac" },
  { slug: "debate-club", name: "Pocket Debate Club", emoji: "⇄", description: "Pick a position. The agent argues the other side and tracks every concession.", prompt: "Convince me that tabs are better than spaces.", tools: ["set motion", "make argument", "concede point"], live: false, color: "#a6accd" },
  { slug: "fortune-cookie", name: "Fortune Cookie", emoji: "☾", description: "Crack open tiny fortunes, save the uncanny ones, and remix the boring ones.", prompt: "Give me a fortune that sounds impossible today and obvious next year.", tools: ["crack", "save", "remix"], live: false, color: "#ffd580" },
  { slug: "soundboard", name: "Agent Soundboard", emoji: "▶", description: "A board of tiny reactions the agent can trigger at exactly the right wrong moment.", prompt: "Play the most appropriate reaction to my terrible idea.", tools: ["list sounds", "play", "favorite"], live: false, color: "#80cbc4" },
  { slug: "time-capsule", name: "Time Capsule", emoji: "◇", description: "Write messages to future-you. The agent labels, seals, and schedules the reveal.", prompt: "Turn today’s messy notes into a letter for next summer.", tools: ["draft", "seal", "schedule", "open"], live: false, color: "#b39ddb" },
];
