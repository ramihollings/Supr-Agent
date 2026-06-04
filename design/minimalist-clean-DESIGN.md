# Design System: Minimalist Clean

## 1. Definition of Style

- **Name:** Minimalist Clean
- **Type:** Minimalist, SaaS, Professional, Light
- **Keywords:** Clean, whitespace, soft shadows, subtle borders, corporate, modern
- **Era:** 2020s SaaS Design
- **Light/Dark:** ☀️ Full / 🌙 Partial

## 2. Structural Specs (Globals Map)

```css
  --border-radius-base: 12px;
  --border-style-base: 1px solid var(--color-outline-variant);
  --shadow-base: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
  --shadow-lg-base: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.03);
```

## 3. Typography

- **Headline Font:** System UI (San Francisco, Segoe UI, Roboto)
- **Body Font:** System UI
- **Characteristics:** Native-feeling, neutral, high legibility. Blends perfectly into the host operating system.

## 4. Components

### Cards & Containers
- Friendly 12px border radius.
- Very subtle 1px border using an outline-variant color.
- Soft, highly feathered drop shadows to provide depth without visual noise.

### General Spacing
- Rely heavily on white space rather than hard dividing lines.
- Content is allowed to breathe.

## 5. UI/UX Principles
- **Reduction:** Remove unnecessary elements. If a border can be replaced by padding, do it.
- **Subtlety:** Shadows and borders should barely register consciously, serving only to separate structural elements.
