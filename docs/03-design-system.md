# Design system

The visual language, and the rules that keep it consistent.

- [The idea](#the-idea)
- [Colour tokens](#colour-tokens)
- [Typography](#typography)
- [Spacing and radii](#spacing-and-radii)
- [Component classes](#component-classes)
- [Tailwind 4 wiring](#tailwind-4-wiring)
- [Iconography](#iconography)
- [Responsive strategy](#responsive-strategy)
- [Accessibility](#accessibility)
- [Rules](#rules)

---

## The idea

A dark, high-contrast console: near-black surfaces, a faint grid behind everything, frosted
translucent panels, and one cyan accent (`#00f0ff`) that carries every interactive state.
Nothing else is coloured. The palette has exactly one hue with a job, so anything glowing
cyan is something the user can act on.

Three families do three jobs and never swap: Space Grotesk for headlines, Geist for prose,
JetBrains Mono for anything the user typed or the machine produced.

---

## Colour tokens

The palette is declared once, in `chat-frontend/tailwind.config.js`, under **Material 3
role names** — `surface`, `on-surface`, `primary-container`, `outline-variant`,
`inverse-primary` and the rest of the set — remapped to the cyberpunk scheme.

The names describe *roles*, not colours, which is what makes them survive a redesign: a
component asking for `text-on-surface-variant` is asking for "secondary text on a surface",
and it keeps being right when the value changes.

The ones that carry the interface:

| Token | Value | Used for |
|---|---|---|
| `background` / `surface` | `#131314` | The page |
| `surface-container-lowest` | `#0e0e0f` | Sidebars, sunken areas |
| `surface-container-high` | `#2a2a2b` | Raised controls, inputs in the header |
| `primary-fixed-dim` | `#00dbe9` | The accent: active channel, links, focus, indicators |
| `primary-container` | `#00f0ff` | The brightest cyan, for solid actions |
| `on-primary-fixed` | `#002022` | Text on top of the accent |
| `on-surface` | `#e5e2e3` | Primary text |
| `on-surface-variant` | `#b9cacb` | Secondary text, labels |
| `outline-variant` | `#3b494b` | Borders, dividers (usually at 10–30% opacity) |
| `secondary` / `secondary-container` | `#ecb2ff` / `#cf5cff` | The violet counterpart, reserved |
| `error` / `error-container` | `#ffb4ab` / `#93000a` | Failures, in text and in surfaces |

Opacity is applied to tokens rather than adding new colours: `border-outline-variant/30`,
`bg-primary-fixed-dim/10`, `text-on-surface-variant/40`. A divider and a hover tint are the
same token at different strengths, which is one decision to make instead of ten values to
keep in step.

---

## Typography

Sizes are not free. Each named scale carries family, size, line height, letter spacing and
weight together, so a heading cannot be half-applied:

| Scale | Family | Size / leading | Where |
|---|---|---|---|
| `display-lg` | Space Grotesk 700 | 64px / 1.1, `-0.02em` | Reserved for a hero |
| `headline-lg` | Space Grotesk 600 | 32px / 1.2, `-0.01em` | Screen titles, modal titles |
| `headline-lg-mobile` | Space Grotesk 600 | 24px / 1.2 | Channel name, panel titles |
| `body-md` | Geist 400 | 16px / 1.6, `0.01em` | Message content |
| `body-sm` | Geist 400 | 14px / 1.5 | Secondary text, helper copy |
| `label-caps` | JetBrains Mono 500 | 12px / 1.0, `0.1em` | Uppercase section labels, buttons |
| `code-md` | JetBrains Mono 400 | 14px / 1.4 | Inputs, e-mails, ids, timestamps |

Two conventions hold everywhere: `label-caps` is always uppercase with wide tracking — it
is the console-panel label — and anything the machine owns (an e-mail address, an id, a
timestamp, the text being typed) is monospaced.

Both families load from Google Fonts in `index.html`, with `preconnect` to
`fonts.googleapis.com` and `fonts.gstatic.com` and `display=swap`: the text paints in a
fallback rather than waiting on the network.

---

## Spacing and radii

```js
spacing: { unit: '4px', 'margin-mobile': '16px', 'margin-desktop': '48px',
           gutter: '24px', 'container-max': '1440px' }
borderRadius: { DEFAULT: '0.125rem', lg: '0.25rem', xl: '0.5rem', full: '0.75rem' }
```

The radius scale is deliberately tight — 2px, 4px, 8px, 12px — and `full` is 12px rather
than a pill. Sharp corners are part of the console look; the softest thing on screen is a
panel, not a button.

---

## Component classes

Five classes in `src/index.css` hold the identity. They exist because each is a
multi-property visual effect used in several places — the threshold for leaving Tailwind
utilities:

```css
.glass-panel {
  background: linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.15);
  border-top: 1px solid rgba(255,255,255,.25);   /* the lit edge */
}
```

| Class | Effect | Applied to |
|---|---|---|
| `.glass-panel` | Frosted translucent surface with a brighter top border | Login card, modal, toast, details panel |
| `.input-cyber` | `#0a0a0a` field; cyan border and glow on focus | Every text field |
| `.btn-primary-cyber` | Solid cyan on near-black text; glow and 1px lift on hover | Primary actions |
| `.bg-grid` | 40px grid at 3% white, both axes | Behind the login and chat screens |
| `.neon-glow`, `.neon-glow-active`, `.neon-text-glow` | The accent halo, as a box or a text shadow | Active channel, headings, live indicators |

The top border of `.glass-panel` is lighter than the other three on purpose: that single
line is what reads as a light source and keeps the panel from looking like a flat grey
rectangle.

The scrollbar is restyled globally — 4px wide, transparent track, translucent cyan thumb —
with `tailwind-scrollbar` available for the scoped cases.

---

## Tailwind 4 wiring

The project runs Tailwind 4 through PostCSS while keeping a JavaScript config:

```css
@import "tailwindcss";
@config "../tailwind.config.js";
```

Tailwind 4's native form is CSS-first (`@theme`). The `@config` directive keeps the v3-style
JS config authoritative, which is what allows tokens to stay in one structured table that
tooling can read, and keeps `darkMode: 'class'` and the `tailwind-scrollbar` plugin
declared where a plugin is normally declared. `postcss.config.js` loads
`@tailwindcss/postcss` and `autoprefixer`; there is no `content` scanning surprise, since
the config lists `index.html` and `src/**/*.{js,ts,jsx,tsx}` explicitly.

`darkMode: 'class'` is configured but unused: the interface is dark, and there is no light
palette to switch to. It is the hook a future theme toggle would need.

---

## Iconography

**Material Symbols Outlined**, loaded as a variable font and configured once:

```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-size: 22px;
  user-select: none;
}
```

Sizes are overridden per use with `!text-[20px]`-style utilities, because the icon font's
own `font-size` is what drives its metrics — a scale transform would blur it.

The vocabulary is consistent and semantic: `tag` for a group channel, `person` for a direct
one, `hub` for the channel identity, `notifications`, `search`, `send`, `mood`, `logout`.
The same concept always gets the same glyph, which is what lets a user learn the interface
once.

---

## Responsive strategy

| Breakpoint | Layout |
|---|---|
| `< md` (768px) | One column. The channel sidebar is replaced by a native `<select>` in the header |
| `md` | Two columns: channels (288px) + conversation |
| `lg` (1024px) | Three columns: channels + conversation + channel details |

Nothing is scaled down and nothing is hidden without a replacement. The mobile channel
picker is a real `<select>` — keyboard, screen reader and platform picker all work with no
code — and the details panel disappears entirely on smaller screens because its content
(who is in this channel) is reference material, not part of the task.

The message column is capped at `max-w-3xl` and centred: a chat line running the full width
of a 27-inch monitor is unreadable, and the limit is a reading-length decision rather than
a layout one.

---

## Accessibility

What is in place:

- Every icon-only button carries an `aria-label` (`Notificações`, `Buscar nas mensagens`,
  `Enviar mensagem`, `Selecionar emoji`, `Fechar mensagem`).
- Toasts use `role="alert"` for errors and `role="status"` for successes — an interruption
  and a confirmation are not the same announcement.
- Inline form errors use `role="alert"`, and the fields they refer to carry `aria-invalid`.
- Every input has a real `<label>` bound by `htmlFor`, plus `autoComplete` values that let a
  password manager work (`current-password` vs `new-password` follows the form's mode).
- Focus is visible: `.input-cyber:focus` replaces the outline with a cyan border and glow,
  and it is never removed without a replacement.

What is not: no focus trap in the modal, no `Escape` to close it, and no skip link. Those
are listed in [the roadmap](05-roadmap.md).

---

## Rules

1. **No hex value in a component.** If a colour is missing, it becomes a token first.
2. **No free `text-[13px]`.** Use a named scale; add one if the design needs it.
3. **Opacity over new colours.** A dimmer border is `outline-variant/20`, not a new value.
4. **A class earns its place in `index.css`** when it is a multi-property effect reused in
   several places. Everything else stays a utility.
5. **An icon-only button gets an `aria-label`.** Without exception.
