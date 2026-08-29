# Roadmap

What is missing, in the order it would be worth doing, and what is deliberately out of
scope. Everything here is honest about which side of the boundary it lives on: several of
these are front-end work that cannot start until the API grows an endpoint.

- [Next](#next)
- [After that](#after-that)
- [Needs the API first](#needs-the-api-first)
- [Deliberately out of scope](#deliberately-out-of-scope)
- [Cleanup already identified](#cleanup-already-identified)

---

## Next

**Tests.** There are none. The three things worth pinning first are the ones where a
regression would be silent: `readUserFromStorage` (expired token, missing claim, garbage
string), the history/live merge in `joinRoom` (a message arriving mid-fetch is kept, and
kept once), and the typing throttle. Vitest plus Testing Library, with the STOMP client
faked at the `Client` boundary.

**A CI workflow.** `npm ci`, `npm run lint`, `npm run build` on every push and pull
request. The build already type-checks, so this is mostly wiring — and it is what makes
the test suite mean anything.

**A Content-Security-Policy.** The session token is in `localStorage`, which makes an
injected script the realistic way to lose it. A CSP naming the origins the app actually
uses — the API, `fonts.googleapis.com`, `fonts.gstatic.com` — is the cheapest mitigation
available before the cookie work below. It is a Vercel header configuration, not code.

**Modal focus handling.** The new-channel modal traps nothing, closes on no key and returns
focus nowhere. `Escape` to close, focus moved to the first field on open and restored to
the trigger on close, and a focus trap while it is open.

**A search box on the member picker.** `GET /users` accepts `search` and `limit`; the
client fetches the default page once and sends neither. On an instance with more than
fifty accounts the picker silently stops showing people, which is the same shape of bug
history pagination had before it was addressed.

**Reverse-infinite scrolling.** Older messages already load, on an explicit button.
Turning that into a fetch triggered by reaching the top of the container is a real
improvement and a real risk: the container's height changes underneath the scroll that
triggered it, so it needs an intersection observer and a scroll anchor rather than an
`onScroll` handler. The button exists because it is correct today; this is what makes it
invisible.

---

## After that

**A `<textarea>` composer.** The handler already reserves `Shift+Enter`; the field is an
`<input>`, so multi-line messages cannot be written. Auto-growing height with a cap is the
work.

**Optimistic messages.** Currently the bubble appears only after the server accepts. On a
slow connection that reads as lag. A pending bubble with a state — sending, failed, retry —
would be an improvement, but it has to keep the current guarantee: nothing on screen may
look sent when it is not.

**Presence.** The lit dot next to each member is decorative; there is no presence channel
behind it. Either it becomes real (a STOMP destination and a connect/disconnect signal on
the API) or it should go.

**Internationalisation.** Interface strings are Portuguese, hard-coded at the point of use.
Extracting them behind a small dictionary is what makes English possible — and would let
the app match the documentation.

---

## Needs the API first

These are blocked, not deprioritised:

| Feature | What the API would have to expose |
|---|---|
| Persistent unread counts | Per-user read state, and a way to mark a room read |
| Delivery and read receipts | Transitions for the `status` field the client already receives |
| Search across channels | A search endpoint; today's search filters what is in memory |
| Direct messages | Nothing new, in fact — `DIRECT` is modelled end to end; only the screen to create one is missing |
| Editing and deleting messages | Endpoints plus the events to fan the change out |
| File and image attachments | Storage, upload endpoint, and a content type on the message |
| Backfill after a reconnect | A "messages since" query. The history endpoint now pages *backwards* with `before`, which loads older messages but cannot catch up on newer ones; a reconnect resubscribes and does not catch up |

The last one is worth stating plainly: **messages sent while the socket is down are not
pushed when it returns.** They appear the next time the room is opened, because that is
when the history is fetched. It is the single biggest gap between this client and a
production chat client.

---

## Deliberately out of scope

Not planned, so their absence is not a to-do:

- **A state library.** Nothing here has the shape Redux or Zustand solves. The session is
  one context; the rest is one screen's state.
- **A component kit.** The interface is a design system with about a dozen elements. A kit
  would be a theme to fight rather than a head start.
- **SSR.** The app is authenticated on every route that matters and has no content worth
  crawling.
- **Native mobile apps.** The responsive layout is the mobile story.
- **Voice and video.** A different problem with a different stack.
- **An HttpOnly cookie without the API's cooperation.** Moving the token out of
  `localStorage` is right, but it is an API change (setting the cookie, CSRF protection, a
  refresh path) and half of it cannot be done here.

---

## Cleanup

**`Chat.tsx` is over 1100 lines.** The channel sidebar, the message list, the composer, the
modal and the notifications dropdown are five components sharing one file. Splitting them
is safe and would make the STOMP logic — the part actually worth reading — visible. This is
the one item left.

Already done:

- The Vite scaffold leftovers are gone — `src/App.css`, `src/assets/hero.png`, `react.svg`
  and `vite.svg` were imported by nothing.
- `chat-frontend/.env` is no longer tracked. It held only localhost defaults, so nothing
  leaked, but `.gitignore` already listed it and `.env.example` now documents both
  variables. Anyone cloning copies the example; the file on an existing checkout is
  untouched.
