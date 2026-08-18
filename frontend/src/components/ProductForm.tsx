'use client';

import { useState } from 'react';

interface Props {
  onCreate: (body: {
    name: string;
    sku: string | null;
    unitWeightG: number;
    toleranceG: number;
    unitPriceCents: number | null;
    active: boolean;
  }) => Promise<void>;
}

export function ProductForm({ onCreate }: Props) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitWeightG, setUnitWeightG] = useState('');
  const [priceReais, setPriceReais] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const weight = Number(unitWeightG);
    if (!name.trim()) return setError('Informe o nome do produto.');
    if (!Number.isFinite(weight) || weight <= 0) return setError('Peso unitário deve ser maior que zero.');

    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        sku: sku.trim() || null,
        unitWeightG: weight,
        toleranceG: 5,
        unitPriceCents: priceReais ? Math.round(Number(priceReais) * 100) : null,
        active: true,
      });
      setName(''); setSku(''); setUnitWeightG(''); setPriceReais('');
    } catch {
      setError('Não foi possível salvar o produto. Verifique se o SKU já não está em uso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="product-name" className="text-xs text-gray-400">Nome</label>
        <input id="product-name" value={name} onChange={(e) => setName(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-sku" className="text-xs text-gray-400">SKU</label>
        <input id="product-sku" value={sku} onChange={(e) => setSku(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-weight" className="text-xs text-gray-400">Peso unitário (g)</label>
        <input id="product-weight" value={unitWeightG} onChange={(e) => setUnitWeightG(e.target.value)}
          inputMode="decimal"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-price" className="text-xs text-gray-400">Preço (R$)</label>
        <input id="product-price" value={priceReais} onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <button type="submit" disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5">
        {saving ? 'Salvando...' : 'Adicionar produto'}
      </button>
      {error && <p role="alert" className="text-red-400 text-sm w-full">{error}</p>}
    </form>
  );
}
