# UI Analysis & Design Implementation Report

This document summarizes the current state of the UI and the gap analysis between the existing implementation and the target **MiniMax** design system described in `DESIGN.md`.

## 1. Design System Overview (MiniMax)

Based on `DESIGN.md`, the target design system focuses on a clean, airy, and professional aesthetic.

### Core Tokens
| Category | Value | Notes |
|----------|-------|-------|
| **Background** | `#ffffff` | Pure white primary background. |
| **Primary Text** | `#222222` | Near black for high contrast. |
| **Brand Color** | `#1456f0` | `--color-brand-6` (Brand Blue). |
| **Accent Color** | `#ea5ec1` | Brand Pink (Decorative only). |
| **Radius (Pill)** | `9999px` | For navigation, tabs, and primary buttons. |
| **Radius (Card)** | `20px–24px` | For product/major showcase cards. |
| **Shadow** | Purple-tinted | `rgba(44, 30, 116, 0.16)` for featured elements. |

### Typography
- **Display**: `Outfit` (Headings)
- **UI Workhorse**: `DM Sans` (Body, Buttons, Nav)
- **Technical**: `Roboto` (Data, Charts)
- **Friendly Sub-headings**: `Poppins`

---

## 2. Current Implementation Assessment

### Global Styles (`spa/src/main.css`)
- [x] Tailwind CSS v4 `@theme` block defines the core tokens correctly.
- [x] Multi-font stack is imported and configured.
- [x] Markdown styles are partially implemented using these tokens.

### Component-Specific State

#### `ProjectStatusReport.tsx` (Main Page)
- **Status**: Mostly aligned.
- **Strengths**: Uses CSS variables like `var(--color-brand-6)`, adopts `rounded-[24px]` for dialog headers.
- **Opportunities**:
    - Filter dropdowns use `rounded-[13px]`, could be standard "Comfortable" (11-13px) or "Generous" (20-24px) depending on size.
    - Some hardcoded transition durations and colors.

#### `TimelineChart.tsx` (Canvas & UI)
- **Status**: Partially aligned.
- **Strengths**: Canvas selection outline uses `SELECTED_BAR_STROKE` (`#1456f0`).
- **Opportunities**:
    - Lane alternate background (`ALT_LANE_BACKGROUND_FILL`) is currently `#ffffff`.
    - Active lane label (`bg-sky-200/80`) uses a hardcoded utility instead of a theme variable.
    - Scrollbar styling could be updated to a "hidden" or "minimalist" version if appropriate for modern airy feel.

#### `TaskDetailsDialog.tsx` (Complex Dialog)
- **Status**: Needs refinement.
- **Strengths**: Uses `rounded-[24px]` for the main dialog envelope.
- **Opportunities**:
    - Uses `rounded-md` (8px) for task row backgrounds.
    - Badges use `rounded-full`, which matches "Pill" style, but padding and font weights could be more consistent.
    - Hardcoded colors like `bg-rose-50`, `bg-amber-50` exist for priorities; these should be harmonized with the clean white-space philosophy.
    - Internal Redmine iframe styling (`EMBEDDED_ISSUE_VIEW_EXTRA_CSS`) needs careful refinement to stay consistent with the host UI.

#### `AiResponsePanel.tsx` (AI Content)
- **Status**: Aligned via Markdown styles.
- **Opportunities**: Container padding and card elevation could be sharpened to match the "Product Card" style (20-24px radius + purple shadow).

---

## 3. Recommended Actions

1.  **Color Harmonization**: Replace all remaining hardcoded Hex/Tailwind colors with `@theme` variables (e.g., `brand-6`, `text-00`).
2.  **Radius Standardization**: Ensure all major panels use `24px` (Generous) and all buttons use `9999px` (Pill) or `8px` (Standard) as per the guide.
3.  **Shadow Audit**: Apply the purple-tinted shadow (`shadow-brand-glow`) to featured elements (e.g., the active report lane or the Task Details dialog).
4.  **Typography Polish**: Ensure `Outfit` is used strictly for headings and `DM Sans` for UI labels. Fix the font fallbacks in `TaskDetailsDialog.tsx`.
5.  **Status Color Sweep**: Review the `statusStyles` in `constants.ts` to ensure they complement the white/blue MiniMax theme without appearing too "muddy".
