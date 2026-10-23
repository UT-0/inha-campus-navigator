/**
 * Vite configuration.
 *
 * `base` must match the URL path the site is served from. On GitHub Pages a
 * project site lives at https://<user>.github.io/<repo>/, so production builds
 * use "/inha-campus-navigator/". Override it with the BASE_PATH environment
 * variable (e.g. BASE_PATH=/ for a custom domain or a user site).
 */
import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` serves the production build, so it needs the same base.
  base:
    process.env.BASE_PATH ?? (command === 'build' || isPreview ? '/inha-campus-navigator/' : '/'),
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
}));
