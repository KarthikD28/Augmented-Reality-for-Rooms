import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// iPhone Safari only allows the camera and motion sensors on HTTPS pages,
// so the dev server runs with a self-signed certificate and listens on your
// local network (host: true) so your phone can reach it.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 1000 },
});
