import { describe, expect, it } from 'vitest';
import {
  achievementForHat,
  achievementProgress,
  ACHIEVEMENT_DEFS,
  createStats,
  type WorldStats,
} from '../src/engine/achievements';
import { LEADERBOARD_DEFS, type LeaderboardDef } from '../src/engine/leaderboards';
import { DEFAULT_TECH_TREE } from '../src/engine/tech';
import { HAT_KINDS, ITEM_KINDS, LEADERBOARD_KINDS } from '../src/engine/types';
import { World, type SerializedWorldState } from '../src/engine/world';
import { createHost, runProgram } from './helpers';

// ------------------------------------------------------------------ logros

describe('Logros (bus de eventos sobre estadísticas)', () => {
  it('hay 59 logros base bien formados', () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(59);
    expect(new Set(ACHIEVEMENT_DEFS.map((a) => a.id)).size).toBe(59);
    const stats = createStats() as unknown as Record<string, unknown>;
    for (const def of ACHIEVEMENT_DEFS) {
      const c = def.condition;
      const kinds = [c.stat, c.item, c.tech, c.allTech, c.manual].filter((k) => k !== undefined);
      expect(kinds, def.id).toHaveLength(1);
      if (c.stat && c.stat !== 'hatsWorn') expect(typeof stats[c.stat], `${def.id}: ${c.stat}`).toBe('number');
      if (c.item) expect(ITEM_KINDS as readonly string[], def.id).toContain(c.item);
      if (c.tech) expect(DEFAULT_TECH_TREE.nodes.some((n) => n.id === c.tech), def.id).toBe(true);
      if (def.reward?.hat) expect(HAT_KINDS as readonly string[], def.id).toContain(def.reward.hat);
    }
    for (const id of ['Swarm', 'Recycling', 'Mud Farm']) expect(ACHIEVEMENT_DEFS.some((a) => a.id === id)).toBe(true);
  });

  it('los recursos obtenidos cuentan aunque se gasten y conceden el logro una sola vez', () => {
    const world = new World({ seed: 1, size: 3 });
    world.gain('Gold', 600_000);
    world.inventory.consume({ Gold: 600_000 });
    world.gain('Gold', 400_000);
    world.checkAchievements();
    world.checkAchievements();
    expect(world.achievements.has('Fortune')).toBe(true);
    const events = world.drainEvents().filter((e) => e.kind === 'achievement' && e.id === 'Fortune');
    expect(events).toHaveLength(1);
    // Fortuna regala la corona de oro.
    expect(achievementForHat('Gold_Crown')?.id).toBe('Fortune');
    expect(world.hatLock('Gold_Crown')).toBeNull();
  });

  it('las estadísticas de los scripts alimentan los logros (cosechas, plantados, impresiones)', () => {
    const r = runProgram('for i in range(3):\n    harvest()\n    move(North)\nprint("hola")');
    expect(r.error).toBeNull();
    expect(r.world.stats.harvests).toBe(3);
    expect(r.world.stats.moves).toBe(3);
    expect(r.world.stats.prints).toBe(1);
    expect(r.world.stats.items.Hay ?? 0).toBeGreaterThan(0);
  });

  it('informa el progreso de cada logro para la interfaz', () => {
    const stats: WorldStats = { ...createStats(), spawns: 3 };
    const swarm = ACHIEVEMENT_DEFS.find((a) => a.id === 'Swarm');
    expect(swarm && achievementProgress(swarm, { ...stats, maxActiveDrones: 12 }, DEFAULT_TECH_TREE, {})).toEqual({
      value: 12,
      target: 32,
    });
  });

  it('el guardado v4 conserva estadísticas y logros; uno v3 empieza con estadísticas en cero', () => {
    const world = new World({ seed: 4, size: 3 });
    world.gain('Hay', 12);
    world.record('flips');
    world.checkAchievements();
    const restored = World.deserialize(JSON.parse(JSON.stringify(world.serialize())) as SerializedWorldState);
    expect(restored.stats.items.Hay).toBe(12);
    expect(restored.stats.flips).toBe(1);
    expect(restored.achievements.has('Barrel Roll')).toBe(true);

    const v3 = JSON.parse(JSON.stringify(world.serialize())) as Record<string, unknown>;
    v3.version = 3;
    delete v3.stats;
    const old = World.deserialize(v3 as unknown as SerializedWorldState);
    expect(old.stats.flips).toBe(0);
    expect(old.achievements.has('Barrel Roll')).toBe(true);
  });

  it('las granjas aisladas de los marcadores no conceden logros', () => {
    const world = new World({ seed: 1, size: 3 });
    world.achievementsEnabled = false;
    world.gain('Gold', 2_000_000);
    world.checkAchievements();
    world.unlockAchievement('Mud Farm');
    expect(world.achievements.size).toBe(0);
  });
});

// ------------------------------------------------------------------ marcadores

const HARVEST = ['while True:', '    if can_harvest():', '        harvest()', '    move(North)'].join('\n');

/** Marcador diminuto para las pruebas: 3 de heno en una granja de 3 × 3. */
const TINY: LeaderboardDef = {
  id: 'Hay_Single',
  name: 'Heno (un dron)',
  description: 'prueba',
  size: [3, 3],
  seed: 5,
  unlocks: { Plant: 1 },
  items: {},
  goal: { item: 'Hay', amount: 3 },
};
const RESET: LeaderboardDef = { id: 'Fastest_Reset', name: 'Reinicio', description: 'prueba', special: 'reset' };

function boardHost() {
  const h = createHost({ leaderboards: [TINY, RESET] });
  h.host.handleMessage({ type: 'SYNC_FILES', files: { 'main.py': 'move(East)', 'run.py': HARVEST } });
  return h;
}

describe('Marcadores locales (leaderboards)', () => {
  it('hay 16 marcadores y cada uno tiene meta o es Fastest_Reset', () => {
    expect(LEADERBOARD_DEFS.map((b) => b.id).sort()).toEqual([...LEADERBOARD_KINDS].sort());
    for (const b of LEADERBOARD_DEFS) {
      if (b.special === 'reset') continue;
      expect(b.goal && b.goal.amount > 0, b.id).toBe(true);
      expect(b.size, b.id).toBeDefined();
      expect(ITEM_KINDS as readonly string[]).toContain(b.goal?.item);
    }
  });

  it('un intento corre en una granja aislada, mide ticks simulados y deja intacta la partida', () => {
    const h = boardHost();
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(1000);
    const home = h.host.currentWorld;
    const homeTicks = home.totalTicks;
    const homeState = JSON.stringify(home.serialize());

    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'run.py', speedup: 10 });
    const during = h.lastSnapshot();
    expect(during.leaderboard).toMatchObject({ boardId: 'Hay_Single', file: 'run.py', goalItem: 'Hay', goalAmount: 3, progress: 0 });
    expect(during.speedMultiplier).toBe(10);
    expect(h.host.currentWorld).not.toBe(home);
    expect(h.host.homeWorld).toBe(home);

    h.host.runTicks(100_000);
    const [result] = h.results();
    expect(result).toMatchObject({ boardId: 'Hay_Single', file: 'run.py', success: true });
    expect(result.ticks).toBeGreaterThan(0);
    expect(h.host.currentWorld).toBe(home);
    expect(home.totalTicks).toBe(homeTicks);
    // Solo cambian las estadísticas (y el logro «Récord personal»).
    expect(home.stats.leaderboardRuns).toBe(1);
    expect(home.achievements.has('Personal Best')).toBe(true);
    const after = JSON.parse(JSON.stringify(home.serialize())) as SerializedWorldState;
    const before = JSON.parse(homeState) as SerializedWorldState;
    expect(after.tiles).toEqual(before.tiles);
    expect(after.inventory).toEqual(before.inventory);
    h.host.handleMessage({ type: 'STEP_TICK', ticks: 1 });
    expect(h.lastSnapshot().leaderboard).toBeNull();
    expect(h.lastSnapshot().speedMultiplier).toBe(1);

    // Determinista: repetir el intento da exactamente los mismos ticks.
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'run.py' });
    h.host.runTicks(100_000);
    expect(h.results()[1]).toMatchObject({ success: true, ticks: result.ticks });
  });

  it('el guardado durante y después de un intento es siempre el de la partida principal', () => {
    const h = boardHost();
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(1000);
    const homeTicks = h.host.currentWorld.totalTicks;
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'run.py' });
    h.host.runTicks(100_000);
    h.advance(20);
    const saves = h.messages.filter((m) => m.type === 'SAVE_REQUIRED');
    expect(saves.length).toBeGreaterThan(0);
    for (const m of saves) if (m.type === 'SAVE_REQUIRED') expect(m.state.totalTicks).toBe(homeTicks);
  });

  it('leaderboard_run() exige la tecnología y arranca el intento al terminar el tick', () => {
    const h = boardHost();
    h.host.handleMessage({
      type: 'SYNC_FILES',
      files: { 'main.py': 'leaderboard_run(Leaderboards.Hay_Single, "run.py", 4)', 'run.py': HARVEST },
    });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(10);
    expect(h.errors()[0]).toMatchObject({ error: expect.stringMatching(/^UnlockError: leaderboard_run\(\) requiere desbloquear/) });

    h.host.currentWorld.unlocks.Leaderboard = 1;
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.handleMessage({ type: 'STEP_TICK', ticks: 1 });
    expect(h.lastSnapshot().leaderboard?.boardId).toBe('Hay_Single');
    expect(h.lastSnapshot().speedMultiplier).toBe(4);
    h.host.runTicks(100_000);
    expect(h.results()).toEqual([expect.objectContaining({ boardId: 'Hay_Single', success: true })]);
  });

  it('un archivo que termina antes de la meta o un STOP_ALL cuentan como intento fallido', () => {
    const h = boardHost();
    h.host.handleMessage({ type: 'SYNC_FILES', files: { 'main.py': 'harvest()', 'run.py': HARVEST } });
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'main.py' });
    h.host.runTicks(10_000);
    expect(h.results()[0]).toMatchObject({ success: false, reason: 'el script terminó antes de la meta' });

    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'run.py' });
    h.host.runTicks(50);
    h.host.handleMessage({ type: 'UNLOCK_TECH', techId: 'Speed' });
    expect(h.consoleLines()).toContain('No se puede desbloquear tecnología durante un intento de marcador.');
    h.host.handleMessage({ type: 'STOP_ALL' });
    expect(h.results()[1]).toMatchObject({ success: false, reason: 'detenido por el jugador' });
    expect(h.host.currentWorld).toBe(h.host.homeWorld);
    expect(h.host.currentScheduler.all).toHaveLength(0);
  });

  it('rechaza marcadores sin meta y archivos inexistentes', () => {
    const h = boardHost();
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Fastest_Reset', file: 'run.py' });
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay_Single', file: 'nada.py' });
    expect(h.results()).toHaveLength(0);
    const lines = h.consoleLines().filter((l) => l.startsWith('✖ No se pudo iniciar el intento'));
    expect(lines).toHaveLength(2);
  });

  it('Fastest_Reset registra los ticks de la partida al desbloquear el sombrero de copa', () => {
    const h = boardHost();
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(1000);
    const world = h.host.currentWorld;
    for (const id of ['Polyculture', 'Megafarm', 'Cactus', 'Dinosaurs']) world.unlocks[id] = Math.max(1, world.unlocks[id] ?? 0);
    const top = DEFAULT_TECH_TREE.nodes.find((n) => n.id === 'Top_Hat');
    for (const [item, amount] of Object.entries(top?.levels[0].cost ?? {})) world.inventory.add(item, amount);
    h.host.handleMessage({ type: 'UNLOCK_TECH', techId: 'Top_Hat' });
    expect(world.unlocks.Top_Hat).toBe(1);
    expect(h.results()).toEqual([
      expect.objectContaining({ boardId: 'Fastest_Reset', success: true, ticks: world.totalTicks }),
    ]);
    // Solo una vez por partida.
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(500);
    expect(h.results()).toHaveLength(1);
  });
});
