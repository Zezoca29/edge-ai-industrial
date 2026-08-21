import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Só a lógica pura é testada aqui: a derivação de estado da bancada e a
 * conversão peso → pacotes. São as duas regras que a tela não pode errar e
 * que não dependem de DOM, rede ou React.
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
