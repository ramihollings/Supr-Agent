# Design System: OpenClaw Terminal

## 1. Definition of Style

- **Name:** OpenClaw Terminal
- **Type:** Hacker, Developer, Retro, CLI
- **Keywords:** Scanlines, glowing text, monospace, terminal, hacker, 90s tech, CRT
- **Era:** 1990s Cyber/Hacker
- **Light/Dark:** ☀️ No / 🌙 Full

## 2. Structural Specs (Globals Map)

```css
  --border-radius-base: 0px;
  --border-style-base: 1px solid var(--color-primary);
  --shadow-base: 0 0 8px var(--color-primary);
  --shadow-lg-base: 0 0 15px var(--color-primary);
  --crt-glow: 0 0 2px var(--color-primary);
```

## 3. Typography

- **Headline Font:** Courier New, Courier, monospace
- **Body Font:** Courier New, Courier, monospace
- **Characteristics:** Every piece of text drops a slight text-shadow to simulate phosphor glow.

## 4. Components

### Backgrounds
- An intricate, multi-layered background featuring radial gradients, repeating linear scanlines, and RGB split artifacts.

### Cards & Containers
- Thin 1px glowing borders.
- Blurry glowing box-shadows mimicking screen bloom rather than physical depth.

### Text & Effects
- All text receives a primary-colored text shadow (`text-shadow: 0 0 2px var(--color-primary)`).
- A fixed curved CRT glass overlay is applied over the entire viewport to simulate convex monitors.

## 5. UI/UX Principles
- **Immersion:** Everything looks like a dedicated hardware terminal.
- **Nostalgia:** No rounded corners. Strictly hard-edged retro aesthetics.
