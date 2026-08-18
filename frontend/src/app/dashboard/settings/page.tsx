'use client';

import { useCallback, useEffect, useState } from 'react';
import { Product, ShelfSlot } from '@/types';
import { apiClient, ApiError } from '@/services/apiClient';
import { ProductForm } from '@/components/ProductForm';
import { ShelfSlotTable } from '@/components/ShelfSlotTable';

export default function SettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [slots, setSlots] = useState<ShelfSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return Promise.all([apiClient.getProducts(), apiClient.getShelfSlots()])
      .then(([p, s]) => {
        setProducts(p);
        setSlots(s);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(body: Omit<Product, 'id'>) {
    await apiClient.createProduct(body);
    await reload();
  }

  function handleBind(slotId: string, productId: string | null, minQty: number) {
    setActionError(null);
    apiClient
      .updateShelfSlot(slotId, { productId, minQty })
      .then(reload)
      .catch((err) => {
        console.error(err);
        setActionError('Não foi possível atualizar a prateleira.');
      });
  }

  function handleTare(slotId: string) {
    setActionError(null);
    apiClient
      .tareShelfSlot(slotId)
      .then(reload)
      .catch((err) => {
        console.error(err);
        if (err instanceof ApiError && err.status === 409) {
          setActionError('Esta prateleira ainda não tem leitura de peso para tarar.');
        } else {
          setActionError('Não foi possível tarar a prateleira.');
        }
      });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Configuração da Loja</h1>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {actionError && (
            <p role="alert" className="text-red-400 text-sm">
              {actionError}
            </p>
          )}

          <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">Produtos</h2>
            <ProductForm onCreate={handleCreate} />
            <ul className="mt-4 flex flex-col gap-1">
              {products.map((p) => (
                <li key={p.id} className="text-sm text-gray-200">
                  {p.name} — {p.unitWeightG}g por unidade
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">Prateleiras</h2>
            <ShelfSlotTable
              slots={slots}
              products={products}
              onBind={handleBind}
              onTare={handleTare}
            />
          </section>
        </div>
      )}
    </div>
  );
}
