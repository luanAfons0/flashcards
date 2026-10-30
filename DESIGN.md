---
name: flashcards
description: A FirstMate Plugin that shows each Card again just before you would forget it, set as printed label stock.
colors:
  band: "#0b6e6e"
  band-ink: "#ffffff"
  ink: "#14171a"
  ink-2: "#444c52"
  ink-3: "#636c72"
  ground: "#f4f6f5"
  stock: "#ffffff"
  sunk: "#eceeed"
  press: "#e6e9e8"
  rule: "#d5dadc"
  rule-2: "#b9c0c4"
  danger: "#a3261d"
  danger-soft: "#fbeceb"
  band-dark: "#4fc2b6"
  band-ink-dark: "#062221"
  ink-dark: "#e8edef"
  ink-2-dark: "#b2bcc1"
  ink-3-dark: "#8b979d"
  ground-dark: "#0f1213"
  stock-dark: "#171b1d"
  sunk-dark: "#131718"
  press-dark: "#20262a"
  rule-dark: "#283033"
  rule-2-dark: "#3a4447"
  danger-dark: "#ff8a7e"
  danger-soft-dark: "rgba(255, 138, 126, .1)"
typography:
  display:
    fontFamily: "\"Segoe UI Variable Display\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "clamp(26px, 5vw, 34px)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  display-cjk:
    fontFamily: "\"Segoe UI Variable Display\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "clamp(40px, 9vw, 56px)"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  headline:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  title:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, Roboto, \"Helvetica Neue\", \"Yu Gothic UI\", \"Meiryo UI\", \"Hiragino Sans\", \"Noto Sans CJK JP\", sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.09em"
  key:
    fontFamily: "\"Cascadia Mono\", Consolas, ui-monospace, \"SF Mono\", Menlo, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
rounded:
  mark: "3px"
  control: "4px"
  label: "6px"
  window: "10px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-secondary:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.press}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.stock}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  grade:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "10px 6px 9px"
    height: "64px"
  grade-hover:
    backgroundColor: "{colors.press}"
  due-cell:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    padding: "14px 16px"
    width: "84px"
  chip:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.mark}"
    padding: "4px 10px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
  input:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "36px"
  key-cap:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink-3}"
    typography: "{typography.key}"
    rounded: "{rounded.mark}"
    padding: "0 5px"
    height: "20px"
---

# Design System: flashcards

## Overview

**Creative North Star: "The Dispensing Label"**

Spaced repetition is a dosage schedule: each Card is a dose and its Grade sets the next one. The Plugin Page is set like printed label stock. Near-black ink sits on cool white stock, hairline rules divide every row and cell, and figures stand in ruled cells with tabular digits. One teal band, printed square-ended into a ruled cell, marks Due. Nothing else is coloured.

Rank comes from weight and case, not size. Page headings are only 19px; the one large element on any screen is the Card text in a Review. Density is calm and operational: one column per screen under a thin top bar, ruled rows, no dashboard and no grid of cards. During a Review the chrome drops faint and the screen holds the Card, its Grades and a small count.

The world refuses the Deck table with red-to-green Grade buttons, the card-grid dashboard, and any game layer (streaks, confetti, celebration). It has its own look and does not copy FirstMate's pages.

**Key Characteristics:**
- Ink on cool white stock, hairline rules, tabular figures in ruled cells.
- One teal band, for Due only.
- Rank by weight (400 to 700) and uppercase micro-labels, not by size.
- The Card text is the only large type.
- Keyboard-first: every Review action shows its key as a key cap.
- Light and dark from the same token set; system fonts only.

## Colors

A near-monochrome ink-and-stock palette with one functional accent and one alarm colour.

### Primary
- **Dispensing Teal** (band; dark theme band-dark): the band. It fills the Due cell of a Deck row, edge to edge, with the figure in bold band-ink. It never fills a button, a tab, a focus ring or a Grade.

### Neutral
- **Label Ink** (ink): all primary text, the primary button fill, selected chips and segments, the active tab underline, and every focus ring.
- **Second Ink** (ink-2): supporting text such as answer extras and Note sub-lines; the primary button hover fill.
- **Faint Ink** (ink-3): column headers, meta lines, help text, intervals, key caps, zero figures, and the Grade marks in the session strip.
- **Cool Ground** (ground): the page behind everything; also the Popup window fill.
- **Label Stock** (stock): every surface that carries content: the top bar, sheets, the Card, forms, setting groups, inputs.
- **Sunk Stock** (sunk): sheet footers, disabled buttons, row hover in the Notes sheet.
- **Press** (press): hover fill for buttons and Grades on fine pointers.
- **Hairline** (rule): every divider, cell rule and surface border.
- **Firm Rule** (rule-2): control borders: buttons, inputs, the Grade row, chips, key caps.

### Tertiary
- **Alarm Red** (danger) and **Alarm Wash** (danger-soft): only the destructive path. The Delete Deck confirm row is washed in danger-soft, its heading is danger, and its confirm button is filled danger. Invalid fields take a danger border and a danger message.

### Named Rules
**The One Band Rule.** The band marks Due and nothing else. A Deck with 0 Due shows a faint 0 in a plain cell. Grades, buttons, links and progress never borrow the band.

**The Ink Is Primary Rule.** The primary action is filled with ink, not with the accent. Selection (chips, segments, active tab) is also ink.

**The Colourless Grade Rule.** Grades carry no colour. Again, Hard, Good and Easy look identical in the Grade row; in the session strip they differ by height only.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui, -apple-system, Roboto, and Japanese UI fallbacks)
**Body Font:** Segoe UI Variable Text (same fallback chain plus Helvetica Neue)
**Label/Mono Font:** Cascadia Mono (with Consolas, ui-monospace, SF Mono, Menlo), for key caps and Cloze source text only

**Character:** System faces, as the product requires no web fonts. The voice comes from weight steps (400, 500, 600, 650, 700), tabular figures and spaced uppercase labels, the way a printed label ranks its lines.

### Hierarchy
- **Display** (600, clamp(26px, 5vw, 34px), 1.3): the Card front in a Review. Long fronts step down to clamp(19px, 3.4vw, 22px) at 1.45; CJK fronts step up to the display-cjk token.
- **Headline** (700, 19px, 1.25): page headings (Decks, Notes, Settings, Add Note) and the Nothing Due heading; also the revealed answer (650).
- **Title** (650, 15px): Deck names, group headings, Grade names, the active tab.
- **Body** (400, 15px, 1.5): running text; empty-state text holds to 52ch, answer extras to 46ch.
- **Body small** (13px): meta lines, help, intervals, sheet footers.
- **Figure** (600, 15px, tabular): counts in ruled cells. A zero drops to 400 in faint ink. A Due figure in the band is 700 at 16px.
- **Label** (600, 11px, 0.09em, uppercase): table column headers and the Card head (Deck name and side).
- **Key** (mono 600, 11px): key caps.

### Named Rules
**The Weight Not Size Rule.** Rank a line by weight, case and ink before size. No page heading exceeds 19px; only the Card front is large.

**The Tabular Figure Rule.** Every count, interval and time renders with tabular numerals, so columns of figures align like a printed table.

## Layout

One centred column per screen under a 52px top bar. The column is 880px for Decks and Notes, 640px for the Review and Settings, and 1040px for the Note editor, which splits into a form and a 320px sticky Card preview with a 28px gap. Page padding is 32px top, 72px bottom, and at least 16px at the sides (safe-area aware). Stacked blocks in a column sit 20px apart.

Content lives in ruled sheets, not grids of cards. A Deck row is a name cell with a meta line, two fixed 84px figure cells (New, Due) with left rules, and a row of ghost actions at the right. Rows pad 14px 16px.

The Review is a single 640px stack: back button and count, the session strip, the Card (min 300px tall), then the controls. The Popup (420 by 560) repeats the same order with tighter padding (14px).

Responsive: at 860px and below the editor drops to one column and the preview stops sticking. At 600px and below the top bar compresses (Add Note becomes a 34px icon button), figure cells shrink to 44px, cell side padding drops to 12px, secondary columns and hints hide, and two-column form rows stack.

Spacing rhythm is small and even: 6, 10, 16, 20 and 32px carry most of the layout.

## Elevation & Depth

Flat label stock by default. Surfaces separate by a stock fill on the cool ground plus a hairline border, not by shadow. Exactly two things lift: the Review Card, which sits on a short stack of two fainter sheets behind it and casts a soft ambient shadow, and the Popup window, which casts a window shadow. Inside the Popup the Card loses its shadow.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px rgba(20, 30, 32, .06), 0 8px 24px -12px rgba(20, 30, 32, .18)`; dark: `0 1px 2px rgba(0, 0, 0, .4), 0 10px 28px -12px rgba(0, 0, 0, .6)`): the Card in a Review on the Plugin Page.
- **Window** (`box-shadow: 0 24px 60px -18px rgba(20, 30, 32, .35), 0 0 0 1px rgba(20, 23, 26, .08)`; dark: `0 28px 70px -20px rgba(0, 0, 0, .8), 0 0 0 1px rgba(255, 255, 255, .07)`): the Popup window.

### Named Rules
**The Flat Stock Rule.** Sheets, forms, groups and empty states are flat: stock, hairline, 6px corners. Only the Review Card and the Popup window may cast a shadow.

**The Faint Chrome Rule.** During a Review the top bar drops to 38% opacity and returns to full on hover or keyboard focus.

## Shapes

Small, near-square corners in four steps: 3px for marks (key caps, chips, Tags), 4px for controls (buttons, inputs, segments, Tag input), 6px for labels (sheets, the Card, the Grade row, forms, groups, empty states), and 10px for the Popup window only. The band is square-ended: it fills its ruled cell with no radius of its own. Borders are always 1px hairlines; the only 2px strokes are the active tab underline, the key cap base, the Cloze gap underline and focus rings.

## Components

### Buttons
Printed and plain: one shape everywhere, ink for the primary action.
- **Shape:** gently squared (4px), min height 34px, 0 14px padding, weight 600, 8px gap for an icon.
- **Primary:** ink fill, stock text. Hover (fine pointers only) moves to ink-2.
- **Secondary:** stock fill, firm-rule border. Hover fills with press.
- **Ghost:** no border or fill, ink-2 text; hover fills with press and darkens to ink. Used for row actions, Undo and Back.
- **Danger:** danger fill, used only to confirm Delete Deck.
- **Icon:** 34px square ghost button with a 16px inline SVG icon and an aria-label.
- **Active:** a slight press to 98% scale; disabled is sunk with faint text and no press. Reduced motion removes the scale.
- **Focus:** 2px ink outline, 2px offset.

### Key caps
Every keyboard action shows its key: mono 11px, faint ink, 20px tall, 3px corners, firm-rule border with a 2px base. Inside a primary button the cap goes transparent and inherits the stock text.

### Deck sheet (signature)
The Decks screen is one ruled sheet: uppercase column headers, Deck name in title weight with a faint meta line, New and Due figures in fixed right-aligned cells with left rules, and the band filling the Due cell when Due is above zero. A sunk footer states today's counts and the Daily Limit. Delete Deck replaces the row in place with a danger-washed confirm row that states the Notes, Cards and Reviews it deletes and offers Keep the Deck (secondary) and Delete Deck (danger).

### Review Card
- **Corner Style:** 6px label corners.
- **Background:** stock, with a hairline border and the Card lift shadow, over two fainter stacked sheets.
- **Head:** a ruled strip with the Deck name and the Card side in uppercase label type.
- **Body:** centred; the front in display type; on reveal, a hairline then the answer (headline weight) and extras in ink-2 and ink-3.
- **Motion:** none. Reveal and Grade are keyboard actions done hundreds of times a day.

### Grade row
Four equal cells in one 6px-cornered bordered strip, split by hairlines. Each cell stacks the Grade name (650), its next interval (13px, faint, tabular) and its key cap. No cell has its own colour. Hover (fine pointers) fills press; active fills rule; focus is an inset ink outline. After reveal, focus lands on Good.

### Session strip
One fixed slot per Card in the session, 10px tall (6px in the Popup), 2px apart. A Grade leaves its mark by height in faint ink: Again a hollow full-height outline, Hard 40%, Good 70%, Easy full. The current slot is full-height ink; future slots are 3px rule stubs.

### Chips
- **Style:** 13px, 4px 10px padding, 3px corners, stock fill, firm-rule border, ink-2 text. Used to filter Notes by Tag.
- **State:** pressed chips fill with ink and take stock text.

### Tags
Inline marks: 12px ink-2 text, hairline border, 3px corners. In the Tag input each Tag carries a small remove button.

### Inputs / Fields
- **Style:** stock fill, firm-rule border, 4px corners, min height 36px, 7px 10px padding. Label above (600, 14px), help below (13px, faint). Cloze source text uses the mono face at 14px/1.6.
- **Focus:** 2px ink outline at 0 offset and an ink border.
- **Error:** danger border and a danger message with a warning icon, placed under the field.
- **Segmented choice:** a bordered strip of labels split by hairlines; the checked one fills with ink.
- **Settings rows:** label and help on the left, a right-aligned tabular number input or fact on the right.

### Navigation
A 52px stock bar with a hairline base: the plugin mark (700), then text tabs at full bar height in faint ink at 500. The current tab goes ink at 650 with a 2px ink underline on the bar's rule. Hover darkens to ink on fine pointers. Add Note (primary) sits at the right. During a Review the bar fades per the Faint Chrome Rule; the Popup has no bar, only a small head with the count.

### Empty and done states
A stock box with a hairline and 6px corners, a 17 to 19px heading, one plain sentence that says what to do, and one button. No illustration, no celebration.

## Do's and Don'ts

### Do:
- **Do** put the band only in the Due cell of a Deck row, and only when Due is above zero.
- **Do** fill the primary action with ink (#14171a light, #e8edef dark) and keep one primary per screen region.
- **Do** rank text by weight and case; keep page headings at 19px and let the Card front be the only large type.
- **Do** set every count, interval and time with tabular numerals in a ruled, right-aligned cell.
- **Do** show the key cap beside every action that has a key.
- **Do** gate hover fills behind `(hover: hover) and (pointer: fine)`.
- **Do** keep the Review still: no transition on reveal, Grade or the next Card. Only rare state changes (the delete confirm, Saved) may fade in, at 0.15s.
- **Do** use inline SVG icons at 16px, always with a text label or an aria-label.

### Don't:
- **Don't** colour the Grades. No red-to-green Grade buttons, no coloured marks in the session strip.
- **Don't** use the band for buttons, links, focus, selection or progress.
- **Don't** lay Decks or Notes out as a grid of cards or a dashboard of statistics.
- **Don't** add streaks, confetti, XP or celebration screens.
- **Don't** shadow flat surfaces; only the Review Card and the Popup window lift.
- **Don't** load web fonts.
