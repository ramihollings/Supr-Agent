# Design System: Futuristic UI Glassmorphism

## 1. Definição do Estilo

- **Nome:** Futuristic UI Glassmorphism
- **Tipo:** Futuristic, Analytical, Cinematic
- **Keywords:** glassmorphism, futuristic, ui, glass, transparent, blur, glowing, 3d
- **Era:** Future Glass
- **Light/Dark:** ✗ No / ✓ Full

## 2. Paleta de Cores

- **Primárias:** Background #020814, Text #FFFFFF, Accent #00F0FF
- **Secundárias:** Glass White #FFFFFF10, Border Glow #00F0FF80, Shadow #000000

## 3. Efeitos Visuais

Isometric 3D rendered assets, glowing circuit board traces, glass-like panels, luminous neon, internal luminescence.

## 4. AI Prompt Keywords

glassmorphism landing page, futuristic glass ui, transparent panels, blur effects, glowing edges, dark background, 3d interface.

## 5. CSS Technical

```css
background-color: #020814; color: #FFFFFF; font-family: 'Exo 2', sans-serif; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;
```

## 6. Design System Variables

```css
--bg-dark: #020814, --glass-fill: rgba(255,255,255,0.05), --border-glow: rgba(0,240,255,0.5), --accent-cyan: #00F0FF, --blur-amt: 12px
```

## 7. Checklist de Implementação

- ☐ Dark background
- ☐ Frosted glass containers (blur)
- ☐ Glowing borders/edges
- ☐ Floating elements with depth
- ☐ Clean sans-serif typography

## 8. Visual Theme & Atmosphere

Futuristic UI Glassmorphism — Design futuristic com glassmorphism, futuristic, ui. Template e prompt pronto para IA. Estilo Futuristic UI Glassmorphism representa uma tendência moderna em design UI/UX web com foco em futuristic.

- Density: 5/10 — Balanced
- Variance: 4/10 — Moderate
- Motion: 8/10 — Cinematic

## 9. Color Palette & Roles

- **Background** (#020814) — Primary background surface
- **Text** (#FFFFFF) — Primary text color
- **Accent** (#00F0FF) — Primary accent, CTAs and interactive elements
- **Glass White** (#FFFFFF10) — Secondary surface
- **Border Glow** (#00F0FF80) — Extended palette, decorative use
- **Shadow** (#000000) — Extended palette, decorative use

## 10. Typography Rules

- **Display / Hero:** Exo 2 — Weight 700, tight tracking, used for headline impact
- **Body:** Exo 2 — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Exo 2 — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem

## 11. Component Stylings

- **Primary Button:** Rounded (16px) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Rounded (16px) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
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
- **Entry animations:** Fade + translate-Y (16px → 0) over 540ms ease-out. Staggered cascades for lists: 120ms between items.
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

Estilo Futuristic UI Glassmorphism representa uma tendência moderna em design UI/UX web com foco em futuristic.

## Caso de Uso

Landing pages, Websites modernas
