import { useGameStore } from '../../store/useGameStore';
import { formatCompact, formatInteger } from '../format';
import { ItemIcon } from '../icons';
import { hudTargets } from './registry';

interface InventoryItemDef {
  id: string;
  label: string;
  /** Tecnología que hace aparecer el ítem en la barra aunque aún no tengas ninguno. */
  unlock?: string;
}

const ITEMS: readonly InventoryItemDef[] = [
  { id: 'Hay', label: 'Heno' },
  { id: 'Wood', label: 'Madera', unlock: 'Plant' },
  { id: 'Carrot', label: 'Zanahorias', unlock: 'Carrots' },
  { id: 'Water', label: 'Agua', unlock: 'Watering' },
  { id: 'Fertilizer', label: 'Fertilizante', unlock: 'Fertilizer' },
  { id: 'Weird_Substance', label: 'Sustancia extraña', unlock: 'Mazes' },
  { id: 'Pumpkin', label: 'Calabazas', unlock: 'Pumpkins' },
  { id: 'Power', label: 'Energía', unlock: 'Sunflowers' },
  { id: 'Cactus', label: 'Cactus', unlock: 'Cactus' },
  { id: 'Gold', label: 'Oro', unlock: 'Mazes' },
  { id: 'Bone', label: 'Huesos', unlock: 'Dinosaurs' },
];

function InventoryItem({ id, label }: InventoryItemDef) {
  const count = useGameStore((s) => s.inventory[id] ?? 0);
  // La energía brilla mientras acelera a los drones.
  const powered = useGameStore((s) => id === 'Power' && s.powered);
  return (
    <div
      className={powered ? 'hud-item hud-powered' : 'hud-item'}
      title={`${label}: ${Number.isInteger(count) ? formatInteger(count) : count.toFixed(2)}`}
      ref={(el) => {
        if (!el) return;
        hudTargets.set(id, el);
        return () => {
          hudTargets.delete(id);
        };
      }}
    >
      <ItemIcon item={id} size={28} />
      <span key={Math.floor(count)} className="hud-count animate-bump">
        {formatCompact(count)}
      </span>
    </div>
  );
}

/** Esquina superior izquierda: fila de ítems con su contador en formato compacto. */
export function InventoryBar() {
  const visible = useGameStore((s) =>
    ITEMS.filter((item) => item.id === 'Hay' || (s.inventory[item.id] ?? 0) > 0 || (item.unlock && (s.unlocks[item.unlock] ?? 0) > 0))
      .map((item) => item.id)
      .join(','),
  );
  const shown = ITEMS.filter((item) => visible.split(',').includes(item.id));
  return (
    <div className="hud-inventory" role="group" aria-label="Inventario">
      {shown.map((item) => (
        <InventoryItem key={item.id} {...item} />
      ))}
    </div>
  );
}
