/**
 * Peso → pacotes. Espelho em TypeScript do `ShelfCalculator` do backend e do
 * `sketch.ino` da bancada Wokwi.
 *
 * A tela precisa desta conta localmente por um motivo: ela mostra lado a lado
 * o que *ela* calcula e o que o *backend* confirma. Se as duas contas
 * divergirem, o operador vê a divergência — que é exatamente o valor da
 * bancada como instrumento de teste. Por isso a regra é copiada com
 * fidelidade, e não aproximada.
 */

/** Peso unitário e tolerância do produto vinculado ao slot. */
export interface UnitSpec {
  unitWeightG: number;
  toleranceG: number;
}

export interface WeightReading {
  /** Pacotes contados, ou null quando não dá para contar (sem produto). */
  count: number | null;
  /** A divisão crua, antes do arredondamento. */
  rawUnits: number | null;
  /** Distância em gramas até o degrau mais próximo. */
  residualG: number;
  /** O resíduo passou da tolerância: a leitura não é confiável. */
  suspect: boolean;
  /** 1 = em cima do degrau, 0 = no pior lugar possível entre dois degraus. */
  confidence: number;
}

/** Peso unitário assumido quando o slot não tem produto vinculado. */
const FALLBACK_UNIT_G = 1000;

/**
 * @param netG peso líquido em gramas (bruto menos tara)
 */
export function packagesFromWeight(netG: number, spec: UnitSpec | null): WeightReading {
  if (!spec || !spec.unitWeightG || spec.unitWeightG <= 0) {
    return { count: null, rawUnits: null, residualG: 0, suspect: false, confidence: 0 };
  }

  const { unitWeightG, toleranceG } = spec;

  if (netG < -toleranceG) {
    // Abaixo da tara: tiraram a própria bandeja. Nunca reportar estoque
    // negativo — o backend faz o mesmo.
    return { count: 0, rawUnits: 0, residualG: Math.abs(netG), suspect: true, confidence: 0 };
  }

  const clamped = netG < 0 ? 0 : netG;
  const rawUnits = clamped / unitWeightG;
  const count = Math.round(rawUnits);
  const residualUnits = Math.abs(rawUnits - count);

  return {
    count,
    rawUnits,
    residualG: residualUnits * unitWeightG,
    suspect: residualUnits * unitWeightG > toleranceG,
    confidence: Math.max(0, 1 - 2 * residualUnits),
  };
}

/** O peso líquido exato de N pacotes — o que a bancada publica ao simular. */
export function weightForPackages(count: number, spec: UnitSpec | null): number {
  const unit = spec && spec.unitWeightG > 0 ? spec.unitWeightG : FALLBACK_UNIT_G;
  return count * unit;
}

export interface RulerTick {
  /** Posição de 0 a 1 ao longo da régua. */
  at: number;
  label: string;
  active: boolean;
}

/**
 * Um degrau por pacote possível. Só os extremos e o degrau ativo ganham
 * rótulo em kg; o resto fica numérico para não virar sopa de texto.
 */
export function rulerTicks(
  maxPackages: number,
  spec: UnitSpec | null,
  active: number | null = null
): RulerTick[] {
  const total = Math.max(1, maxPackages);
  return Array.from({ length: total + 1 }, (_, i) => {
    const isEdge = i === 0 || i === total;
    const kg = weightForPackages(i, spec) / 1000;
    return {
      at: i / total,
      label: i === 0 ? '0' : isEdge || i === active ? `${formatKg(kg)} kg` : String(i),
      active: active !== null && i === active,
    };
  });
}

function formatKg(kg: number): string {
  return kg.toLocaleString('pt-BR', { maximumFractionDigits: kg % 1 === 0 ? 0 : 2 });
}
