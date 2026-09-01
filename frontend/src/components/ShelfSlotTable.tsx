'use client';

import { Product, ShelfSlot } from '@/types';
import { muted } from '@/components/ui/primitives';

interface Props {
  slots: ShelfSlot[];
  products: Product[];
  /** minQty nulo deixa o minimo a cargo do backend: ao trocar de produto
   *  ele adota o minimo combinado daquele produto. */
  onBind: (slotId: string, productId: string | null, minQty: number | null) => void;
  onTare: (slotId: string) => void;
  /** Nome do dispositivo dono do slot, para a coluna de bancada. */
  deviceNameFor?: (deviceId: string) => string;
}

export function ShelfSlotTable({ slots, products, onBind, onTare, deviceNameFor }: Props) {
  if (slots.length === 0) {
    return (
      <p className="text-sm" style={{ color: muted(50) }}>
        Nenhuma prateleira registrada ainda. Um slot nasce quando o dispositivo publica peso pela
        primeira vez.
      </p>
    );
  }

  return (
    <div className="noct-scroll overflow-x-auto">
      <table className="table min-w-[720px]">
        <thead>
          <tr>
            <th>Bancada</th>
            <th>Slot</th>
            <th>Produto</th>
            <th>Mínimo</th>
            <th>Atual</th>
            <th>Tara (g)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.id}>
              <td className="whitespace-nowrap">
                {deviceNameFor ? deviceNameFor(slot.deviceId) : slot.deviceId.slice(0, 8)}
              </td>
              <td>#{slot.slotIndex}</td>
              <td>
                <label htmlFor={`slot-product-${slot.id}`} className="sr-only">
                  Produto da prateleira {slot.slotIndex}
                </label>
                <select
                  id={`slot-product-${slot.id}`}
                  className="input"
                  value={slot.productId ?? ''}
                  onChange={(e) => onBind(slot.id, e.target.value || null, null)}
                >
                  <option value="">Não configurado</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <label htmlFor={`slot-min-${slot.id}`} className="sr-only">
                  Estoque mínimo da prateleira {slot.slotIndex}
                </label>
                <input
                  id={`slot-min-${slot.id}`}
                  key={`${slot.id}-${slot.minQty}`}
                  className="input w-20"
                  type="number"
                  min={0}
                  defaultValue={slot.minQty}
                  onBlur={(e) => onBind(slot.id, slot.productId, Number(e.target.value))}
                />
              </td>
              <td className="tabular-nums">
                {slot.currentQty ?? '—'}
                {slot.suspect && (
                  <span className="ml-2 text-[11px]" style={{ color: 'var(--color-warn)' }}>
                    suspeita
                  </span>
                )}
              </td>
              <td className="tabular-nums">{slot.tareG.toFixed(0)}</td>
              <td>
                <button
                  type="button"
                  onClick={() => onTare(slot.id)}
                  className="btn btn-secondary text-xs"
                  title="Zerar a balança com a bandeja vazia"
                >
                  Tarar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
