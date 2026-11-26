import { Isolator, type FunctionObject, type RuntimeValue } from './values';
import { DroneVM } from './droneVm';
import type { Scheduler } from './scheduler';

/** Lo que la flota necesita del mundo: cuerpos físicos de los drones y el límite de Megafarm. */
export interface FleetWorld {
  maxDrones(): number;
  addDrone(id: number, x: number, y: number): void;
  removeDrone(id: number): void;
  getDrone(id: number): { x: number; y: number };
  /** Estadística para logros (Swarm): drones activos a la vez. */
  recordActiveDrones?(count: number): void;
  recordSpawn?(): void;
}

/** Resultados guardados de drones hijos ya terminados (para wait_for tardíos). */
const MAX_RESULTS = 4096;

/**
 * Megafarm (doc 02 §3): crea drones hijos aislados en la casilla del padre, lleva la cuenta de
 * `num_drones()` / `max_drones()` y conserva el valor de retorno de cada hijo para `wait_for()`.
 * Los hijos terminados se retiran del planificador y del mundo (sin fugas en ejecuciones largas).
 */
export class DroneFleet {
  private readonly scheduler: Scheduler;
  private readonly world: () => FleetWorld;
  private nextId = 1;
  private reserved = 0;
  private readonly results = new Map<number, RuntimeValue>();

  constructor(scheduler: Scheduler, world: () => FleetWorld) {
    this.scheduler = scheduler;
    this.world = world;
  }

  maxDrones(): number {
    return Math.max(1, Math.floor(this.world().maxDrones()));
  }

  activeCount(): number {
    return this.scheduler.activeCount();
  }

  /** Reserva un hueco para un dron nuevo (false si ya se alcanzó max_drones()). */
  reserve(): boolean {
    if (this.activeCount() + this.reserved >= this.maxDrones()) return false;
    this.reserved++;
    return true;
  }

  release(): void {
    this.reserved = Math.max(0, this.reserved - 1);
  }

  /** Comprueba los argumentos de spawn_drone() antes de crear el dron (el error es del padre). */
  checkArgs(fn: FunctionObject, args: RuntimeValue[]): void {
    DroneVM.checkEntryArgs(fn, args);
  }

  /** Crea el hijo (consume una reserva) y devuelve su id. */
  spawn(parent: DroneVM, fn: FunctionObject, args: RuntimeValue[]): number {
    this.release();
    const id = this.nextId++;
    const child = parent.spawnChild(id, fn, args);
    const world = this.world();
    const body = world.getDrone(parent.id);
    world.addDrone(id, body.x, body.y);
    this.scheduler.add(child);
    world.recordSpawn?.();
    world.recordActiveDrones?.(this.activeCount());
    return id;
  }

  /** Resultados guardados para wait_for() tardíos (acotados a MAX_RESULTS). */
  get storedResults(): number {
    return this.results.size;
  }

  /** Próximo id de dron hijo. */
  get spawnedTotal(): number {
    return this.nextId - 1;
  }

  find(id: number): DroneVM | undefined {
    return this.scheduler.get(id);
  }

  /** ¿Terminó (o no existe)? */
  isFinished(id: number): boolean {
    const vm = this.scheduler.get(id);
    return vm ? !vm.isActive : true;
  }

  /** Valor de retorno de un hijo terminado, copiado para que el que espera tenga su propia memoria. */
  resultOf(id: number): RuntimeValue {
    const vm = this.scheduler.get(id);
    const value = vm ? (vm.status === 'FINISHED' ? vm.returnValue : null) : (this.results.get(id) ?? null);
    return new Isolator().clone(value);
  }

  /** Retira los hijos terminados (guardando su resultado) y quita sus cuerpos del mundo. */
  collect(): void {
    const world = this.world();
    for (const vm of [...this.scheduler.all]) {
      if (vm.id === 0 || vm.isActive) continue;
      this.results.set(vm.id, vm.status === 'FINISHED' ? vm.returnValue : null);
      if (this.results.size > MAX_RESULTS) {
        const oldest = this.results.keys().next().value;
        if (oldest !== undefined) this.results.delete(oldest);
      }
      this.scheduler.remove(vm);
      world.removeDrone(vm.id);
    }
  }

  /** Se llama tras cada tick: estadística de drones activos a la vez. */
  observe(): void {
    this.world().recordActiveDrones?.(this.activeCount());
  }

  /** Nueva ejecución: sin hijos, sin reservas, ids desde 1. */
  reset(): void {
    const world = this.world();
    for (const vm of this.scheduler.all) if (vm.id !== 0) world.removeDrone(vm.id);
    this.nextId = 1;
    this.reserved = 0;
    this.results.clear();
  }
}
