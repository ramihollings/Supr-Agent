# Design System: Supr Clean

## 1. Definition of Style

- **Name:** Supr Clean
- **Type:** Friendly, Default, Modern, Balanced
- **Keywords:** Soft borders, rounded corners, large typography, calm, unified
- **Era:** Modern Apple/Stripe inspired
- **Light/Dark:** ☀️ Full / 🌙 Partial

## 2. Structural Specs (Globals Map)

```css
  --border-radius-base: 10px;
  --border-style-base: 1px solid var(--color-outline-variant);
  --shadow-base: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-lg-base: 0 12px 32px -12px rgba(15, 23, 42, 0.18);
  
  /* Hardcoded variant overrides for ultimate cleanliness */
  --color-outline-variant-val: #e2e8f0;
  --color-surface-variant-val: #f1f5f9;
  --color-surface-container-val: #f8fafc;
  --color-surface-container-high-val: #eef2f7;
  --color-surface-container-low-val: #ffffff;
```

## 3. Typography

- **Headline Font:** Inter, System UI
- **Body Font:** Inter, System UI
- **Characteristics:** Larger default font size (`15px`), with a slight negative letter-spacing (`-0.005em`) to create tight, cohesive word blocks.

## 4. Components

### Palettes
- Supr Clean is designed to coexist with every color palette by lightening the outline token locally. It forces specific light greys (`#f1f5f9`, `#e2e8f0`) to ensure a peaceful interface regardless of the base palette.

### Cards & Containers
- Clean 10px radius.
- Extremely soft shadows (`rgba(15, 23, 42, 0.18)`), specifically tinted with a slight slate-blue hue.
- Text shadows are explicitly stripped (`text-shadow: none`).

## 5. UI/UX Principles
- **Universal Harmony:** The interface should feel calm and usable over extremely long sessions.
- **Anti-Fatigue:** Sharp edges and high-contrast lines are softened to reduce eye strain.
