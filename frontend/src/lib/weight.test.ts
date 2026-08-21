import { describe, expect, it } from 'vitest';
import { packagesFromWeight, weightForPackages, rulerTicks } from './weight';

/**
 * Este é o espelho em TypeScript do `ShelfCalculator` do backend e do
 * `sketch.ino` da bancada. Os três têm de concordar: peso líquido dividido
 * pelo peso unitário, arredondado, e o resíduo comparado à tolerância.
 */
describe('packagesFromWeight', () => {
  const arroz = { unitWeightG: 5000, toleranceG: 500 };

  it('conta o número exato de pacotes num peso limpo', () => {
    const r = packagesFromWeight(25000, arroz);
    expect(r.count).toBe(5);
    expect(r.suspect).toBe(false);
    expect(r.residualG).toBeCloseTo(0);
  });

  it('aceita um desvio dentro da tolerância e arredonda para o degrau', () => {
    // 5 pacotes + 300 g de sujeira: abaixo dos 500 g de tolerância.
    const r = packagesFromWeight(25300, arroz);
    expect(r.count).toBe(5);
    expect(r.suspect).toBe(false);
    expect(r.residualG).toBeCloseTo(300);
  });

  it('marca como suspeito o peso que cai fora do degrau', () => {
    // 2,5 pacotes: meio caminho entre dois degraus, o pior caso.
    const r = packagesFromWeight(12500, arroz);
    expect(r.suspect).toBe(true);
    expect(r.residualG).toBeCloseTo(2500);
  });

  it('trata a bandeja vazia como zero pacotes, não como suspeita', () => {
    const r = packagesFromWeight(0, arroz);
    expect(r.count).toBe(0);
    expect(r.suspect).toBe(false);
  });

  it('abaixo da tara: zero pacotes e suspeita, como no ShelfCalculator', () => {
    // Peso líquido abaixo de -tolerância significa que tiraram a própria
    // bandeja. O backend devolve 0 e marca suspeita; a tela faz igual.
    const r = packagesFromWeight(-800, arroz);
    expect(r.count).toBe(0);
    expect(r.suspect).toBe(true);
  });

  it('absorve um líquido levemente negativo dentro da tolerância', () => {
    const r = packagesFromWeight(-120, arroz);
    expect(r.count).toBe(0);
    expect(r.suspect).toBe(false);
  });

  it('desiste em vez de dividir por zero quando o produto não tem peso unitário', () => {
    const r = packagesFromWeight(25000, { unitWeightG: 0, toleranceG: 500 });
    expect(r.count).toBeNull();
    expect(r.suspect).toBe(false);
  });

  it('desiste quando não há produto vinculado', () => {
    expect(packagesFromWeight(25000, null).count).toBeNull();
  });
});

describe('weightForPackages', () => {
  it('devolve o peso do degrau exato', () => {
    expect(weightForPackages(4, { unitWeightG: 5000, toleranceG: 500 })).toBe(20000);
  });

  it('sem produto, cai num pacote de 1 kg para a bancada continuar utilizável', () => {
    expect(weightForPackages(3, null)).toBe(3000);
  });
});

describe('rulerTicks', () => {
  const arroz = { unitWeightG: 5000, toleranceG: 500 };

  it('marca um degrau por pacote, do zero ao máximo', () => {
    const ticks = rulerTicks(6, arroz);
    expect(ticks).toHaveLength(7);
    expect(ticks[0].label).toBe('0');
    expect(ticks[6].label).toBe('30 kg');
  });

  it('acende apenas o degrau da contagem atual', () => {
    const ticks = rulerTicks(6, arroz, 4);
    expect(ticks.filter((t) => t.active)).toHaveLength(1);
    expect(ticks[4].active).toBe(true);
  });

  it('não acende degrau nenhum quando a contagem é suspeita (null)', () => {
    expect(rulerTicks(6, arroz, null).some((t) => t.active)).toBe(false);
  });
});
