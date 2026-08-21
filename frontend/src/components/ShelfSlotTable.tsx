'use client';

import { Product, ShelfSlot } from '@/types';

interface Props {
  slots: ShelfSlot[];
  products: Product[];
  /** minQty nulo deixa o minimo a cargo do backend: ao trocar de produto
   *  ele adota o minimo combinado daquele produto. */
  onBind: (slotId: string, productId: string | null, minQty: number | null) => void;
  onTare: (slotId: string) => void;
}

export function ShelfSlotTable({ slots, products, onBind, onTare }: Props) {
  if (slots.length === 0) {
    return <p className="text-gray-400 text-sm">Nenhuma prateleira registrada ainda.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          <th className="py-2">Prateleira</th>
          <th className="py-2">Produto</th>
          <th className="py-2">Estoque mínimo</th>
          <th className="py-2">Estoque atual</th>
          <th className="py-2">Tara (g)</th>
          <th className="py-2">Ações</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((slot) => (
          <tr key={slot.id} className="border-b border-gray-800 text-gray-200">
            <td className="py-2">#{slot.slotIndex}</td>
            <td className="py-2">
              <label htmlFor={`slot-product-${slot.id}`} className="sr-only">
                Produto da prateleira {slot.slotIndex}
              </label>
              <select
                id={`slot-product-${slot.id}`}
                value={slot.productId ?? ''}
                onChange={(e) => onBind(slot.id, e.target.value || null, null)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value="">Não configurado</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </td>
            <td className="py-2">
              <label htmlFor={`slot-min-${slot.id}`} className="sr-only">
                Estoque mínimo da prateleira {slot.slotIndex}
              </label>
              <input
                id={`slot-min-${slot.id}`}
                key={`${slot.id}-${slot.minQty}`}
                type="number"
                min={0}
                defaultValue={slot.minQty}
                onBlur={(e) => onBind(slot.id, slot.productId, Number(e.target.value))}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm w-20"
              />
            </td>
            <td className="py-2">
              {slot.currentQty ?? '—'}
              {slot.suspect && (
                <span className="ml-2 text-yellow-400 text-xs">leitura suspeita</span>
              )}
            </td>
            <td className="py-2">{slot.tareG.toFixed(0)}</td>
            <td className="py-2">
              <button
                onClick={() => onTare(slot.id)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs rounded px-2 py-1"
              >
                Tarar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
