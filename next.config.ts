/**
 * next.config.ts — Next.js framework configuration.
 *
 * Owns: build- and runtime-level framework options for the whole site. This is the only
 * place where routing, image, header, or bundler behaviour is configured globally.
 *
 * Deliberately NOT set, with reasons, so nobody re-adds them by reflex:
 *   - `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds`: never. `npm run build`
 *     failing on a type or lint error is the point of the gate.
 *   - `images.remotePatterns`: no remote images exist; the headshot is a local file under
 *     `public/images/`. Add a pattern only when a project screenshot is hosted elsewhere.
 *   - Security headers / Content-Security-Policy: not configured yet. Add them via
 *     `headers()` once the deployment target is chosen and can be verified against.
 *
 * @see node_modules/next/dist/docs/ for the version-matched reference.
 */
import type { NextConfig } from "next";

/** The configuration object. Empty today: every option above is intentionally default. */
const nextConfig: NextConfig = {};

export default nextConfig;
