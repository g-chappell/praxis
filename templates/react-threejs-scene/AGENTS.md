# AGENTS.md — React + Three.js scene

> Template-specific guidance loaded by Claude Code on its first turn in this
> workspace. Conventions for building a 3D web scene with React Three Fiber.

## Stack

- **Vite + React 18 + TypeScript** (strict). Entry: `src/main.tsx` → `src/App.tsx`.
- **three.js** via **@react-three/fiber** (`<Canvas>`, hooks like `useFrame`) and
  **@react-three/drei** helpers (`OrbitControls`, loaders, etc.).
- Dev server: `npm run dev` (Vite on port **5173**, bound to `0.0.0.0` so the
  preview URL is reachable). `npm run build` type-checks + builds.

## Conventions

- Build the scene declaratively as components rendered inside `<Canvas>`. Drive
  per-frame animation with `useFrame((state, delta) => …)`, not `setInterval`.
- Keep a single `<Canvas>`; compose meshes/lights/controls as children. Hold
  mutable three objects in `useRef` (e.g. `useRef<Mesh>(null)`), not state.
- Prefer `<meshStandardMaterial>` + at least one light; the default scene has an
  ambient + a directional light. Add `<OrbitControls />` (drei) for navigation.
- Units are metres-ish; keep the camera a few units back (`position={[3,3,3]}`).

## Textures & assets

- Put image assets under `public/textures/` and load them with drei's
  `useTexture('/textures/<file>.png')`. The **image-gen MCP server** is available —
  use it to generate textures/sprites when the user asks, then save into
  `public/textures/`.
- Load GLTF/GLB models with drei's `useGLTF` from `public/models/`.

## Don't

- Don't add a second `<Canvas>` or render three objects outside one.
- Don't block the render loop with synchronous heavy work; suspend with
  `<Suspense>` around async loaders.
