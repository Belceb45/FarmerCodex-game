import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/config/balance';
import { DEFAULT_HAT, HAT_KINDS } from '../src/engine/types';
import { World } from '../src/engine/world';
import { runProgram } from './helpers';

describe('Sombreros (change_hat)', () => {
  it('el dron empieza con el sombrero por defecto', () => {
    const world = new World({ seed: 1 });
    expect(world.drones[0].hat).toBe(DEFAULT_HAT);
  });

  it('cambia el sombrero al terminar la espera y cuesta lo que indica balance.json', () => {
    const r = runProgram('change_hat(Hats.Beanie)\nquick_print(get_tick_count())');
    expect(r.error).toBeNull();
    expect(r.world.drones[0].hat).toBe('Beanie');
    expect(r.output).toEqual([String(DEFAULT_BALANCE.builtinCosts.change_hat)]);
  });

  it('emite un evento de cambio de sombrero', () => {
    const r = runProgram('change_hat(Hats.Flower_Crown)');
    const events = r.world.drainEvents();
    expect(events).toContainEqual(expect.objectContaining({ kind: 'hat', hat: 'Flower_Crown', droneId: 0 }));
  });

  it('el sombrero de copa exige su tecnología (Unlocks.Top_Hat)', () => {
    const locked = runProgram('change_hat(Hats.Top_Hat)');
    expect(locked.error).toMatch(/^UnlockError: change_hat\(Hats\.Top_Hat\) requiere desbloquear/);
    const world = new World({ seed: 1, size: 3, unlocks: { Top_Hat: 1 } });
    const r = runProgram('change_hat(Hats.Top_Hat)', { world });
    expect(r.error).toBeNull();
    expect(r.world.drones[0].hat).toBe('Top_Hat');
  });

  it('los sombreros de logro exigen el logro (Swarm → Viking_Helmet)', () => {
    const locked = runProgram('quick_print(num_unlocked(Hats.Viking_Helmet))\nchange_hat(Hats.Viking_Helmet)');
    expect(locked.output).toEqual(['0']);
    expect(locked.error).toMatch(/^UnlockError: change_hat\(Hats\.Viking_Helmet\) requiere el logro «Enjambre»/);
    const world = new World({ seed: 1, size: 3 });
    world.unlockAchievement('Swarm');
    const r = runProgram('quick_print(num_unlocked(Hats.Viking_Helmet))\nchange_hat(Hats.Viking_Helmet)', { world });
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['1']);
    expect(r.world.drones[0].hat).toBe('Viking_Helmet');
  });

  it('todos los sombreros están en el enum Hats', () => {
    const r = runProgram(HAT_KINDS.map((h) => `quick_print(Hats.${h})`).join('\n'));
    expect(r.output).toEqual(HAT_KINDS.map((h) => `Hats.${h}`));
  });

  it('rechaza valores que no son sombreros', () => {
    const r = runProgram('change_hat(Items.Hay)');
    expect(r.error).toMatch(/^TypeError: change_hat\(\) espera un sombrero/);
  });

  it('el sombrero se conserva al serializar el mundo', () => {
    const r = runProgram('change_hat(Hats.Carrot_Top)');
    const restored = World.deserialize(r.world.serialize());
    expect(restored.drones[0].hat).toBe('Carrot_Top');
  });

  it('un estado antiguo sin sombrero recupera el sombrero por defecto', () => {
    const state = new World({ seed: 3 }).serialize();
    delete state.drones[0].hat;
    expect(World.deserialize(state).drones[0].hat).toBe(DEFAULT_HAT);
  });
});

describe('Perro alcancía (pet_the_dog)', () => {
  it('emite un evento en la casilla del dron y cuesta lo que indica balance.json', () => {
    const r = runProgram('move(East)\npet_the_dog()\nquick_print(get_tick_count())');
    expect(r.error).toBeNull();
    const pet = r.world.drainEvents().find((e) => e.kind === 'pet');
    expect(pet).toMatchObject({ kind: 'pet', droneId: 0, x: 1, y: 0 });
    const expected = DEFAULT_BALANCE.ticks.physicalActionSuccess + DEFAULT_BALANCE.builtinCosts.pet_the_dog;
    expect(r.output).toEqual([String(expected)]);
  });

  it('no acepta argumentos', () => {
    const r = runProgram('pet_the_dog(1)');
    expect(r.error).toMatch(/^TypeError: pet_the_dog\(\) espera 0 argumentos/);
  });
});
