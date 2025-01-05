import { defineConfig } from 'vitest/config'
import packageJson from './package.json'
import angular from '@analogjs/vite-plugin-angular'

const angularPlugin = angular({ tsconfig: 'tsconfig.test.json', jit: true })

export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.test.json', jit: true })],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    pool: 'threads',
    environment: 'jsdom',
    setupFiles: ['./tests/test-setup.ts'],
    globals: true,
    disableConsoleIntercept: true,
    typecheck: {
      enabled: false,
      tsconfig: './tsconfig.json',
    },
  },
})
