/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  // Izinkan akses dev dari perangkat lain di jaringan lokal (uji dari HP).
  // Daftar dapat ditimpa via env LAN_ORIGINS (pisahkan dengan koma).
  allowedDevOrigins: (process.env.LAN_ORIGINS ?? '192.168.100.84,192.168.0.73,192.168.230.163').split(','),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
