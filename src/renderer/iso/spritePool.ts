import { Sprite, type Texture } from 'pixi.js';

/**
 * Pool de sprites (doc 05 §4, Fase 4): los cultivos, fantasmas de cosecha, destellos, iconos que
 * vuelan al HUD y segmentos de cola se reutilizan en lugar de crearse y destruirse en cada acción.
 * Con 32 drones cosechando a máxima velocidad evita miles de objetos por segundo para el recolector.
 *
 * Un sprite del pool se devuelve con `release()` (nunca con `destroy()`); `release()` lo saca de la
 * escena y lo deja listo para el siguiente `acquire()`. Liberar dos veces el mismo sprite no tiene
 * efecto, así nunca se entrega a dos dueños a la vez.
 */
export class SpritePool {
  private readonly free: Sprite[] = [];
  private readonly freeSet = new Set<Sprite>();
  private readonly max: number;
  private created = 0;

  constructor(max = 1024) {
    this.max = max;
  }

  /** Sprites esperando reutilización. */
  get available(): number {
    return this.free.length;
  }

  /** Sprites creados en total (los reutilizados no cuentan). */
  get totalCreated(): number {
    return this.created;
  }

  acquire(texture: Texture): Sprite {
    const sprite = this.free.pop();
    if (!sprite) {
      this.created++;
      return new Sprite(texture);
    }
    this.freeSet.delete(sprite);
    sprite.texture = texture;
    const anchor = texture.defaultAnchor;
    sprite.anchor.set(anchor?.x ?? 0, anchor?.y ?? 0);
    sprite.position.set(0, 0);
    sprite.scale.set(1, 1);
    sprite.skew.set(0, 0);
    sprite.rotation = 0;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    sprite.blendMode = 'normal';
    sprite.visible = true;
    sprite.zIndex = 0;
    return sprite;
  }

  release(sprite: Sprite | null | undefined): void {
    if (!sprite || sprite.destroyed || this.freeSet.has(sprite)) return;
    sprite.removeFromParent();
    if (this.free.length >= this.max) {
      sprite.destroy();
      return;
    }
    this.free.push(sprite);
    this.freeSet.add(sprite);
  }

  /** Destruye los sprites en espera (al cerrar el escenario). */
  drain(): void {
    for (const sprite of this.free) if (!sprite.destroyed) sprite.destroy();
    this.free.length = 0;
    this.freeSet.clear();
  }
}
