# Design System: Cyber-Tribal

## 1. Definição do Estilo

- **Nome:** Cyber-Tribal
- **Tipo:** Futuristic, Primal, Visionary
- **Keywords:** cyber-tribal, futuristic, primal, visionary, psychedelic, geometric patterns, neon, organic tech, glowing, immersive
- **Era:** Future-Primitivism
- **Light/Dark:** ✗ No / ✓ Full

## 2. Paleta de Cores

- **Primárias:** Electric Cyan #00FFFF, Jungle Green #29AB87, Neon Magenta #FF00FF, Deep Indigo #4B0082
- **Secundárias:** Solar Orange #FF4500, Blacklight Purple #BF00FF, White #FFFFFF, Black #000000

## 3. Efeitos Visuais

Glowing geometric patterns, psychedelic animations, organic tech interfaces, tribal masks with a cyber twist, neon light trails, immersive 3D environments, holographic elements, pulsating rhythms

## 4. AI Prompt Keywords

Design a cyber-tribal landing page. Use: electric cyan and jungle green, glowing geometric patterns, psychedelic animations, organic tech interfaces, tribal masks with a cyber twist, neon light trails, immersive 3D environments, holographic elements.

## 5. CSS Technical

```css
background: #000000, color: #00FFFF, text-shadow: 0 0 10px #FF00FF, animation: pulse-glow 2s infinite alternate, font-family: 'Azonix', sans-serif, border: 1px solid #00FFFF, box-shadow: 0 0 20px rgba(0,255,255,0.5), background-image: url('tribal-pattern.svg'), background-blend-mode: overlay, perspective: 800px
```

## 6. Design System Variables

```css
--electric-cyan-tribal: #00FFFF, --jungle-green-tribal: #29AB87, --neon-magenta-tribal: #FF00FF, --deep-indigo-tribal: #4B0082, --glow-pulse-duration: 2s, --font-tribal: 'Azonix', sans-serif
```

## 7. Checklist de Implementação

- ☐ Glowing geometric patterns
- ☐ Psychedelic animations
- ☐ Organic tech interfaces
- ☐ Cyber-tribal masks
- ☐ Neon light trails
- ☐ Immersive 3D environments

## 8. Visual Theme & Atmosphere

Cyber-Tribal — Design general com cyber-tribal, futuristic, primal. Template e prompt pronto para IA. Estilo Cyber-Tribal representa uma tendência moderna em design UI/UX web com foco em general.

- Density: 5/10 — Balanced
- Variance: 8/10 — Expressive
- Motion: 8/10 — Cinematic

## 9. Color Palette & Roles

- **Electric Cyan** (#00FFFF) — Accent highlight, links and focus states
- **Jungle Green** (#29AB87) — Secondary surface or text color
- **Neon Magenta** (#FF00FF) — Decorative accent, highlight elements
- **Deep Indigo** (#4B0082) — Accent color, emphasis elements
- **Solar Orange** (#FF4500) — Warm accent, call-to-action secondary
- **Blacklight Purple** (#BF00FF) — Deep contrast surface
- **White** (#FFFFFF) — Secondary surface
- **Black** (#000000) — Deep contrast surface

## 10. Typography Rules

- **Display / Hero:** Azonix — Weight 700, tight tracking, used for headline impact
- **Body:** Azonix — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Azonix — 0.875rem, weight 500, slight letter-spacing
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

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 540ms ease-out. Staggered cascades for lists: 120ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.

## 14. Anti-Patterns (Banned)

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure white (#FFFFFF) backgrounds — use off-white or dark surfaces
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

## Contexto Histórico

Estilo Cyber-Tribal representa uma tendência moderna em design UI/UX web com foco em general.

## Caso de Uso

Landing pages, SaaS
