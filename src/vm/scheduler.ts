import type { ExecEnv } from './builtins';
import type { DroneVM } from './droneVm';

export interface TickOptions {
  /** Dron que debe detenerse al llegar al inicio de una sentencia (modo Paso). */
  stepDroneId?: number | null;
  /**
   * Ticks de trabajo de cada dron por tick del mundo (Items.Power: 2). Con valores fraccionarios
   * el resto se acumula, de modo que 1.5 alterna 1 y 2 ticks de forma determinista.
   */
  speed?: number;
  /** Milisegundos simulados por tick sin multiplicadores (espera fija de do_a_flip). Por defecto 2.5 (400 ticks/s). */
  fixedMsPerTick?: number;
}

export interface TickOutcome {
  /** El dron indicado en `stepDroneId` alcanzó una frontera de sentencia. */
  stepStopped: boolean;
}

/**
 * Planificador Round-Robin: en cada tick del motor recorre los drones activos por orden de ID.
 * Un dron con una acción física en curso solo descuenta su espera; si no, ejecuta
 * instrucciones hasta agotar el presupuesto de 1 tick o disparar otra acción física.
 * Con Items.Power cada dron repite ese paso `speed` veces por tick del mundo (doc 02 §2). Un dron
 * bloqueado (WAITING) comprueba en cada tick si lo que espera ya terminó.
 */
export class Scheduler {
  private readonly drones: DroneVM[] = [];
  private speedCarry = 0;

  add(vm: DroneVM): void {
    this.drones.push(vm);
    this.drones.sort((a, b) => a.id - b.id);
  }

  /** Quita un dron ya terminado (la flota guarda su resultado). */
  remove(vm: DroneVM): void {
    const i = this.drones.indexOf(vm);
    if (i >= 0) this.drones.splice(i, 1);
  }

  get all(): readonly DroneVM[] {
    return this.drones;
  }

  get(id: number): DroneVM | undefined {
    return this.drones.find((d) => d.id === id);
  }

  hasActiveDrones(): boolean {
    return this.drones.some((d) => d.isActive);
  }

  /** Drones que siguen ejecutándose (consumen Items.Power). */
  activeCount(): number {
    let n = 0;
    for (const d of this.drones) if (d.isActive) n++;
    return n;
  }

  /** Dron activo de menor ID (o el de menor ID si ninguno está activo). */
  primary(): DroneVM | undefined {
    return this.drones.find((d) => d.isActive) ?? this.drones[0];
  }

  /** Detiene y descarta todos los drones (las acciones pendientes no se aplican). */
  stopAll(): void {
    for (const d of this.drones) d.cancel();
    this.drones.length = 0;
    this.speedCarry = 0;
  }

  tick(env: ExecEnv, options: TickOptions = {}): TickOutcome {
    this.speedCarry += Math.max(1, options.speed ?? 1);
    const steps = Math.max(1, Math.floor(this.speedCarry));
    this.speedCarry -= steps;
    const fixedMs = options.fixedMsPerTick ?? 2.5;
    let stepStopped = false;
    // Los hijos creados durante este tick (spawn_drone) se añaden al final y empiezan en el siguiente.
    const count = this.drones.length;
    for (let i = 0; i < count; i++) {
      const drone = this.drones[i];
      // Bloqueados (wait_for, do_a_flip): la espera fija se descuenta una vez por tick, sin Items.Power.
      if (drone.status === 'WAITING' && !drone.tickBlocked(fixedMs)) continue;
      for (let s = 0; s < steps && drone.status === 'RUNNING'; s++) {
        if (drone.waitTicks > 0) {
          drone.tickWait(1);
          continue;
        }
        const result = drone.run(1, env, options.stepDroneId === drone.id);
        if (result.stoppedAtStatement) {
          stepStopped = true;
          break;
        }
      }
    }
    return { stepStopped };
  }
}
