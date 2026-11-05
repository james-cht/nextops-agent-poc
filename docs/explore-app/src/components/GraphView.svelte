<script lang="ts">
  import type { GraphData } from '../lib/types';
  import { onMount } from 'svelte';

  type Props = {
    graph: GraphData;
    focus?: string;
    onSelect: (id: string) => void;
  };

  let { graph, focus, onSelect }: Props = $props();

  let canvas: SVGSVGElement | undefined = $state();
  let positions = $state<Record<string, { x: number; y: number; vx: number; vy: number }>>({});
  let w = $state(900);
  let h = $state(560);
  let raf = 0;

  const colorFor = (kind: string) => {
    if (kind === 'doc') return 'var(--doc)';
    if (kind === 'page') return 'var(--page)';
    if (kind === 'api') return 'var(--api)';
    if (kind === 'drift') return 'var(--drift)';
    return '#666';
  };

  function initPositions() {
    const next: typeof positions = {};
    const n = graph.nodes.length || 1;
    graph.nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2;
      const radius = Math.min(w, h) * 0.36;
      next[node.id] = {
        x: w / 2 + Math.cos(angle) * radius,
        y: h / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      };
    });
    positions = next;
  }

  function tick() {
    const nodes = graph.nodes;
    const pos = { ...positions };
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i].id];
        const b = pos[nodes[j].id];
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const force = 1200 / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
    }
    // springs
    for (const e of graph.edges) {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = e.kind === 'undocumented' ? 140 : 110;
      const force = (dist - ideal) * 0.02;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
    // center gravity + integrate
    for (const node of nodes) {
      const p = pos[node.id];
      if (!p) continue;
      p.vx += (w / 2 - p.x) * 0.005;
      p.vy += (h / 2 - p.y) * 0.005;
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.x = Math.min(w - 24, Math.max(24, p.x + p.vx));
      p.y = Math.min(h - 24, Math.max(24, p.y + p.vy));
    }
    positions = pos;
    raf = requestAnimationFrame(tick);
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(360, rect.height);
    });
    if (canvas) ro.observe(canvas);
    initPositions();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  $effect(() => {
    // re-init when graph identity changes
    graph.nodes.length;
    initPositions();
  });
</script>

<svg bind:this={canvas} class="graph-canvas" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="文件與程式碼表面關係圖">
  {#each graph.edges as edge}
    {@const a = positions[edge.from]}
    {@const b = positions[edge.to]}
    {#if a && b}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={edge.kind === 'undocumented' ? '#c27a00' : edge.kind === 'doc-link' ? '#9bb5ab' : '#8aa4c7'}
        stroke-width={edge.kind === 'undocumented' ? 2 : 1}
        stroke-dasharray={edge.kind === 'undocumented' ? '4 3' : undefined}
        opacity="0.85"
      />
    {/if}
  {/each}
  {#each graph.nodes as node}
    {@const p = positions[node.id]}
    {#if p}
      <g
        style="cursor:pointer"
        onclick={() => onSelect(node.id)}
        onkeydown={(e) => e.key === 'Enter' && onSelect(node.id)}
        tabindex="0"
        role="button"
        aria-label={node.label}
      >
        <circle
          cx={p.x}
          cy={p.y}
          r={node.kind === 'drift' ? 16 : node.id === focus ? 14 : 10}
          fill={colorFor(node.kind)}
          stroke={node.id === focus ? '#1c2a24' : '#fff'}
          stroke-width={node.id === focus ? 3 : 1.5}
        />
        <text
          x={p.x}
          y={p.y + 22}
          text-anchor="middle"
          font-size="10"
          fill="#1c2a24"
        >{node.label.length > 28 ? node.label.slice(0, 26) + '…' : node.label}</text>
      </g>
    {/if}
  {/each}
</svg>

<p class="muted" style="margin:0.75rem 0 0;font-size:0.85rem">
  綠＝文件 · 藍＝頁面 · 紫＝API · 橘＝Drift。點選節點可導向文件或聚焦。
</p>
