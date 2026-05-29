# Design System: Aurora UI

## 1. Definição do Estilo

- **Nome:** Aurora UI
- **Tipo:** Ethereal, Gradient, Premium, Animated
- **Keywords:** Vibrant gradients, smooth blend, Northern Lights effect, mesh gradient, luminous, atmospheric, abstract
- **Era:** 2020s Modern
- **Light/Dark:** ✓ Full / ✓ Full

## 2. Paleta de Cores

- **Primárias:** Complementary: Blue-Orange, Purple-Yellow, Electric Blue #0080FF, Magenta #FF1493, Cyan #00FFFF
- **Secundárias:** Smooth transitions (Blue→Purple→Pink→Teal), iridescent effects, blend modes (screen, multiply)

## 3. Efeitos Visuais

Large flowing CSS/SVG gradients, subtle 8-12s animations, depth via color layering, smooth morph

## 4. AI Prompt Keywords

Create a vibrant gradient interface inspired by Northern Lights with mesh gradients, smooth color blends, flowing animations. Use complementary color pairs (blue-orange, purple-yellow), flowing background gradients, subtle continuous animations (8-12s loops), iridescent effects.

## 5. CSS Technical

```css
background: conic-gradient or radial-gradient with multiple stops, animation: @keyframes gradient (8-12s), background-size: 200% 200%, filter: saturate(1.2), blend-mode: screen or multiply
```

## 6. Design System Variables

```css
--gradient-colors: complementary pairs, --animation-duration: 8-12s, --blend-mode: screen, --color-saturation: 1.2, --effect: iridescent, --loop-smooth: true
```

## 7. Checklist de Implementação

- ☐ Mesh/flowing gradients applied
- ☐ 8-12s animation loop
- ☐ Complementary colors used
- ☐ Smooth color transitions
- ☐ Iridescent effect subtle
- ☐ Text contrast verified

## 8. Visual Theme & Atmosphere

Gradientes fluxo animado, efeito Northern Lights, cores complementares. Interface luminosa e atmosférica. Prompt para gradientes dinâmicos. Mesh gradients (2021+) e CSS Houdini trazem animações fluidas tipo Northern Lights. Popular em SaaS premium e creative tools.

- Density: 5/10 — Balanced
- Variance: 4/10 — Moderate
- Motion: 6/10 — Expressive

## 9. Color Palette & Roles

- **Electric Blue** (#0080FF) — Accent highlight, links and focus states
- **Magenta** (#FF1493) — Decorative accent, highlight elements
- **Cyan** (#00FFFF) — Accent highlight, links and focus states

## 10. Typography Rules

- **Display / Hero:** System UI stack (-apple-system, sans-serif) — Weight 700, tight tracking, used for headline impact
- **Body:** System UI stack (-apple-system, sans-serif) — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** System UI stack (-apple-system, sans-serif) — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem

## 11. Component Stylings

- **Primary Button:** Moderately rounded (0.75rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Moderately rounded (0.75rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.

## 12. Layout Principles

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Split-screen (text left, visual right).
- **Feature sections:** Zig-zag alternating text+image rows. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).

## 13. Motion & Interaction

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 480ms ease-out. Staggered cascades for lists: 100ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
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

Mesh gradients (2021+) e CSS Houdini trazem animações fluidas tipo Northern Lights. Popular em SaaS premium e creative tools.

## Caso de Uso

SaaS premium, Creative tools, Agência moderna, Brand exclusiva
