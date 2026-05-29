# Design System: 8-Bit Retro Terminal

## 1. Definição do Estilo

- **Nome:** 8-Bit Retro Terminal
- **Tipo:** Technical, Nostalgic, Cryptic
- **Keywords:** 8-bit, retro, pixel, terminal, green, arcade, game, console
- **Era:** 80s Computing
- **Light/Dark:** ✗ No / ✓ Full

## 2. Paleta de Cores

- **Primárias:** Background #050505, Text #2CFF56, Accent #FFB200
- **Secundárias:** Pixel White #FFFFFF, Coin Yellow #FFD700, Heart Red #FF0000

## 3. Efeitos Visuais

ASCII art, pixel-art iconography, binary strings, bracket-style terminal frames, CRT monitor phosphor glow, scanlines.

## 4. AI Prompt Keywords

8-bit landing page, retro terminal style, pixel art, green phosphor text, scanlines, arcade game aesthetic.

## 5. CSS Technical

```css
background-color: #050505; color: #2CFF56; font-family: 'Press Start 2P', cursive; image-rendering: pixelated; border: 4px solid #2CFF56;
```

## 6. Design System Variables

```css
--bg-pixel: #050505, --pixel-green: #2CFF56, --pixel-yellow: #FFB200, --font-pixel: 'Press Start 2P', cursive, --border-thick: 4px solid
```

## 7. Checklist de Implementação

- ☐ Pixel art fonts/icons
- ☐ High contrast black/green/yellow
- ☐ Blocky layout elements
- ☐ CRT scanline overlay (optional)
- ☐ Arcade game references

## 8. Visual Theme & Atmosphere

8-Bit Retro Terminal — Design retro com 8-bit, retro, pixel. Template e prompt pronto para IA. Estilo 8-Bit Retro Terminal representa uma tendência moderna em design UI/UX web com foco em retro.

- Density: 8/10 — Dense
- Variance: 7/10 — Dynamic
- Motion: 4/10 — Subtle

## 9. Color Palette & Roles

- **Background** (#050505) — Primary background surface
- **Text** (#2CFF56) — Primary text color
- **Accent** (#FFB200) — Primary accent, CTAs and interactive elements
- **Pixel White** (#FFFFFF) — Secondary surface
- **Coin Yellow** (#FFD700) — Warning states, attention indicators
- **Heart Red** (#FF0000) — Error states, destructive actions

## 10. Typography Rules

- **Display / Hero:** Press Start 2P — Weight 700, tight tracking, used for headline impact
- **Body:** Press Start 2P — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Press Start 2P — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem

## 11. Component Stylings

- **Primary Button:** Subtly rounded (0.5rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Subtly rounded (0.5rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.

## 12. Layout Principles

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Asymmetric composition.
- **Feature sections:** Asymmetric grid with varied card sizes. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).

## 13. Motion & Interaction

- **Physics:** Ease-out curves, 200-300ms duration. Smooth and predictable.
- **Entry animations:** Fade + translate-Y (16px → 0) over 420ms ease-out. Staggered cascades for lists: 80ms between items.
- **Hover states:** Subtle color shift + shadow adjustment over 200ms.
- **Page transitions:** Fade only (200ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.

## 14. Anti-Patterns (Banned)

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

## Contexto Histórico

Estilo 8-Bit Retro Terminal representa uma tendência moderna em design UI/UX web com foco em retro.

## Caso de Uso

Landing pages, Websites modernas
