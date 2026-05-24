<script setup lang="ts">
import { computed, onScopeDispose, reactive } from "vue";
import chalk from "chalk";
import { Box, Text, useExit, useInput } from "@vue-tui/runtime";

// --- world dimensions ----------------------------------------------------

const W = 50;
const H = 18;
const BIRD_COL = 8;

// --- physics tuning ------------------------------------------------------

const GRAVITY = 0.35;
const FLAP_VELOCITY = -1.6;
const TERMINAL_VELOCITY = 2.0;
const TICK_MS = 80;

// --- pipes ---------------------------------------------------------------

const PIPE_WIDTH = 3;
const PIPE_GAP = 5;
const PIPE_SPACING = 14;
const SCROLL_PER_TICK = 1;

interface Pipe {
  x: number;
  gapTop: number;
  passed: boolean;
}

interface World {
  bird: { y: number; vy: number };
  pipes: Pipe[];
  score: number;
  best: number;
  dead: boolean;
  started: boolean;
  ticks: number;
}

function makeWorld(best: number): World {
  return {
    bird: { y: H / 2, vy: 0 },
    pipes: [],
    score: 0,
    best,
    dead: false,
    started: false,
    ticks: 0,
  };
}

function randomGapTop(): number {
  return 1 + Math.floor(Math.random() * (H - PIPE_GAP - 2));
}

function step(w: World): void {
  w.ticks++;

  w.bird.vy = Math.min(TERMINAL_VELOCITY, w.bird.vy + GRAVITY);
  w.bird.y += w.bird.vy;

  const last = w.pipes[w.pipes.length - 1];
  if (!last || last.x <= W - PIPE_SPACING) {
    w.pipes.push({ x: W, gapTop: randomGapTop(), passed: false });
  }

  for (const p of w.pipes) p.x -= SCROLL_PER_TICK;

  while (w.pipes.length > 0 && w.pipes[0]!.x + PIPE_WIDTH < 0) {
    w.pipes.shift();
  }

  for (const p of w.pipes) {
    if (!p.passed && p.x + PIPE_WIDTH - 1 < BIRD_COL) {
      p.passed = true;
      w.score++;
      if (w.score > w.best) w.best = w.score;
    }
  }

  const by = Math.round(w.bird.y);
  if (by < 0 || by >= H) {
    w.dead = true;
    return;
  }
  for (const p of w.pipes) {
    if (BIRD_COL >= p.x && BIRD_COL < p.x + PIPE_WIDTH) {
      if (by < p.gapTop || by >= p.gapTop + PIPE_GAP) {
        w.dead = true;
        return;
      }
    }
  }
}

// --- rendering -----------------------------------------------------------

const PIPE_CELL = chalk.green("█");
const BIRD_CELL = chalk.yellow.bold(">");
const DEAD_CELL = chalk.red.bold("x");
const GROUND_CELL = chalk.gray("·");

function renderFrame(w: World): string[] {
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => " "));

  for (const p of w.pipes) {
    for (let dx = 0; dx < PIPE_WIDTH; dx++) {
      const x = p.x + dx;
      if (x < 0 || x >= W) continue;
      for (let y = 0; y < H; y++) {
        const inGap = y >= p.gapTop && y < p.gapTop + PIPE_GAP;
        if (!inGap) grid[y]![x] = PIPE_CELL;
      }
    }
  }

  const by = Math.max(0, Math.min(H - 1, Math.round(w.bird.y)));
  grid[by]![BIRD_COL] = w.dead ? DEAD_CELL : BIRD_CELL;

  for (let x = 0; x < W; x++) {
    if (grid[H - 1]![x] === " " && (x + w.ticks) % 4 === 0) {
      grid[H - 1]![x] = GROUND_CELL;
    }
  }

  return grid.map((row) => row.join(""));
}

// --- component -----------------------------------------------------------

const exit = useExit();
const world = reactive<World>(makeWorld(0));

function flap(): void {
  if (world.dead) return;
  world.started = true;
  world.bird.vy = FLAP_VELOCITY;
}

function restart(): void {
  const best = world.best;
  Object.assign(world, makeWorld(best));
}

useInput((input, key) => {
  if ((key.ctrl && input === "c") || input === "q") {
    exit();
    return;
  }
  if (world.dead) {
    if (input === "r") restart();
    return;
  }
  if (input === " " || input === "w" || key.upArrow) {
    flap();
  }
});

const tickId = setInterval(() => {
  if (world.dead || !world.started) return;
  step(world);
}, TICK_MS);
onScopeDispose(() => clearInterval(tickId));

const lines = computed(() => renderFrame(world));
const hint = computed(() =>
  world.dead
    ? "press r to restart, q to quit"
    : world.started
      ? "space / ↑ to flap"
      : "press space to start",
);

const playfieldWidth = W + 2;
</script>

<template>
  <Box flexDirection="column">
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" :width="playfieldWidth">
      <Text v-for="(line, i) in lines" :key="i" wrap="truncate">{{ line }}</Text>
    </Box>
    <Box flexDirection="row" justifyContent="space-between" :width="playfieldWidth" :paddingX="1">
      <Text color="yellow" bold>score {{ world.score }} best {{ world.best }}</Text>
      <Text color="gray">{{ hint }}</Text>
    </Box>
  </Box>
</template>
