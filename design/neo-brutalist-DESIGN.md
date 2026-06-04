# Design System: Neo-Brutalist

## 1. Definition of Style

- **Name:** Neo-Brutalist
- **Type:** Brutalism, High Contrast, Bold, Graphic
- **Keywords:** Thick borders, solid fills, sharp edges, offset drop shadows, high contrast, web3, modern
- **Era:** 2020s Neo-Brutalism
- **Light/Dark:** ☀️ Full / 🌙 Partial

## 2. Structural Specs (Globals Map)

```css
  --border-radius-base: 0px;
  --border-style-base: 3px solid var(--color-primary);
  --shadow-base: 4px 4px 0px 0px var(--color-primary);
  --shadow-lg-base: 6px 6px 0px 0px var(--color-primary);
```

## 3. Typography

- **Headline Font:** Space Grotesk
- **Body Font:** Inter
- **Characteristics:** Bold, highly legible, strong tracking, high contrast headers.

## 4. Components

### Cards & Containers
- Sharp 0px border radius.
- Thick 3px solid primary border.
- Hard, non-blurred offset shadows (4px / 6px) to emulate physical stacking.

### Buttons & Inputs
- Hover states slightly shift the box shadow offset to simulate pressing down.
- Focus rings are sharp and thick.

## 5. UI/UX Principles
- **Clarity through contrast:** No subtle gradients or soft blurs. Everything is sharply separated by thick lines.
- **Utilitarian feel:** Content is the absolute priority, delivered without superfluous decoration.
