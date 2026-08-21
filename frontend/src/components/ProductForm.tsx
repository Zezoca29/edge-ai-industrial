'use client';

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { muted } from '@/components/ui/primitives';

interface Props {
  onCreate: (body: {
    name: string;
    sku: string | null;
    unitWeightG: number;
    toleranceG: number;
    defaultMinQty: number | null;
    unitPriceCents: number | null;
    active: boolean;
  }) => Promise<void>;
}

/**
 * Tolerância padrão proporcional ao peso da unidade: 1,5%, com piso de 5 g.
 * Um valor fixo de 5 g representa 0,5% de um produto de 1 kg — dentro do ruído
 * do HX711 — e faria o slot nascer permanentemente marcado como suspeito.
 */
export function defaultToleranceG(unitWeightG: number): number {
  if (!Number.isFinite(unitWeightG) || unitWeightG <= 0) return 5;
  return Math.round(Math.max(5, unitWeightG * 0.015) * 10) / 10;
}

export function ProductForm({ onCreate }: Props) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitWeightG, setUnitWeightG] = useState('');
  const [toleranceG, setToleranceG] = useState('');
  const [minQty, setMinQty] = useState('');
  const [priceReais, setPriceReais] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestedTolerance = defaultToleranceG(Number(unitWeightG));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const weight = Number(unitWeightG);
    if (!name.trim()) return setError('Informe o nome do produto.');
    if (!Number.isFinite(weight) || weight <= 0)
      return setError('Peso unitário deve ser maior que zero.');

    const tolerance = toleranceG.trim() === '' ? defaultToleranceG(weight) : Number(toleranceG);
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      return setError('Tolerância deve ser maior que zero.');
    }

    // Em branco significa "sem mínimo combinado" — a prateleira fica com o
    // próprio padrão. Zero é um valor legítimo (repor só quando acabar).
    const min = minQty.trim() === '' ? null : Number(minQty);
    if (min !== null && (!Number.isInteger(min) || min < 0)) {
      return setError('Mínimo para repor deve ser um número inteiro de 0 para cima.');
    }

    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        sku: sku.trim() || null,
        unitWeightG: weight,
        toleranceG: tolerance,
        defaultMinQty: min,
        unitPriceCents: priceReais ? Math.round(Number(priceReais) * 100) : null,
        active: true,
      });
      setName('');
      setSku('');
      setUnitWeightG('');
      setToleranceG('');
      setMinQty('');
      setPriceReais('');
    } catch {
      setError('Não foi possível salvar o produto. Verifique se o SKU já não está em uso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="field min-w-[160px] flex-1">
        <label htmlFor="product-name">Nome</label>
        <input
          id="product-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field w-28">
        <label htmlFor="product-sku">SKU</label>
        <input
          id="product-sku"
          className="input"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <div className="field w-36">
        <label htmlFor="product-weight">Peso unitário (g)</label>
        <input
          id="product-weight"
          className="input"
          value={unitWeightG}
          onChange={(e) => setUnitWeightG(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="field w-40">
        <label htmlFor="product-tolerance">
          Tolerância (g) <span style={{ color: muted(40) }}>— opcional</span>
        </label>
        <input
          id="product-tolerance"
          className="input"
          value={toleranceG}
          onChange={(e) => setToleranceG(e.target.value)}
          inputMode="decimal"
          placeholder={String(suggestedTolerance)}
          aria-describedby="product-tolerance-help"
        />
        <span id="product-tolerance-help" className="text-[11px]" style={{ color: muted(40) }}>
          Em branco usa {suggestedTolerance} g (1,5% do peso)
        </span>
      </div>
      <div className="field w-36">
        <label htmlFor="product-min-qty">
          Mínimo para repor <span style={{ color: muted(40) }}>— opcional</span>
        </label>
        <input
          id="product-min-qty"
          className="input"
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          type="number"
          min={0}
          step={1}
          aria-describedby="product-min-qty-help"
        />
        <span id="product-min-qty-help" className="text-[11px]" style={{ color: muted(40) }}>
          Adotado pela prateleira ao vincular
        </span>
      </div>
      <div className="field w-28">
        <label htmlFor="product-price">Preço (R$)</label>
        <input
          id="product-price"
          className="input"
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary">
        <Plus size={15} />
        {saving ? 'Salvando…' : 'Adicionar produto'}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm" style={{ color: 'var(--color-crit)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
