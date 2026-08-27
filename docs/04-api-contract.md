# API contract

Every request this client makes, every payload it sends, and every shape it expects back.
The authority is [chat-api](https://github.com/patrickpriebe/chat-api); this file records
what the front-end depends on.

- [Base URLs](#base-urls)
- [Authorisation](#authorisation)
- [Types](#types)
- [REST endpoints](#rest-endpoints)
- [STOMP destinations](#stomp-destinations)
- [Errors](#errors)
- [Where the client is stricter than the API](#where-the-client-is-stricter-than-the-api)

---

## Base URLs

```ts
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
export const WS_URL  = import.meta.env.VITE_WS_URL  || `${API_URL.replace(/\/api\/?$/, '')}/ws`;
```

`WS_URL` is derived from `API_URL` by stripping a trailing `/api` and appending `/ws`. The
SockJS endpoint is a sibling of the REST base in the standard deployment; set `VITE_WS_URL`
explicitly when it is not.

---

## Authorisation

Every REST request except registration and login carries a bearer token, attached by a
single axios interceptor:

```
Authorization: Bearer <jwt>
```

The STOMP `CONNECT` frame carries the same header, validated by a channel interceptor on
the API. Authenticated STOMP frames are then associated with a `Principal`, which is how
`/app/typing` knows who is typing without trusting the payload.

Claims the client reads from the token:

| Claim | Used as |
|---|---|
| `sub` | The user's e-mail |
| `userId` | The user's id — compared against `senderId` and member ids |
| `username` | Display name, and the filter for the user's own typing events |
| `exp` | Expiry; a token past it is discarded on read |

A token missing any of `sub`, `userId` or `username` is treated as invalid and removed.

---

## Types

```ts
interface UserSummary {
  id: string;          // UUID
  username: string;
  email: string;
}

interface Room {
  id: string;                    // UUID
  name: string;
  type: 'DIRECT' | 'GROUP';
  members: UserSummary[];
}

interface ChatMessage {
  id: string;                    // UUID
  content: string;
  senderId: string;              // UUID
  senderUsername: string;
  roomId: string;                // UUID
  status: 'SENT' | 'DELIVERED' | 'READ';
  timestamp: string;             // ISO-8601, parsed with `new Date(...)`
}

interface TypingEvent {
  roomId: string;
  username: string;              // resolved by the server, not sent by the client
  isTyping: boolean;
}
```

`RoomResponseDTO` also carries `createdAt`; the client does not declare it, because nothing
renders it. Extra fields are ignored rather than rejected — the client reads what it needs.

---

## REST endpoints

### `POST /users` — register

```json
{ "username": "nexo", "email": "nexo@example.com", "password": "secret1" }
```

`201 Created` with a `UserSummary`. Server-side validation: username 3–50 characters,
valid e-mail, password at least 6 characters.

The register form immediately follows a success with `POST /auth/login`, so a new account
lands in the chat without a second screen.

### `POST /auth/login` — sign in

```json
{ "email": "nexo@example.com", "password": "secret1" }
```

`200 OK`:

```json
{ "token": "eyJhbGciOi..." }
```

The token is passed to `signIn`, which stores it and derives the session from its claims.

### `GET /users` — everyone

`200 OK` with `UserSummary[]`. Used to populate the member picker; the current user is
filtered out client-side.

> The endpoint returns every registered user. That is a product decision on the API's side
> (a small demo instance with no directory model), and the client does not paginate or
> search it.

### `GET /rooms/me` — my channels

`200 OK` with `Room[]` — every room the authenticated user is a member of, each with its
full member list. This response is what the STOMP subscription set is built from.

### `POST /rooms` — create a channel

```json
{ "name": "engineering", "type": "GROUP", "memberIds": ["uuid", "uuid"] }
```

`201 Created` with the `Room`. The creator is added by the API; the client sends only the
other members. `memberIds` must not be empty, and the client refuses to submit an empty
selection before the request is made.

The new room is appended to the list, subscribed on the live STOMP client, and opened.

### `GET /messages/room/{roomId}` — history

`200 OK` with `ChatMessage[]`, ordered by timestamp ascending. The API re-checks that the
caller is a member of the room and answers with a business-rule error otherwise.

The client re-sorts anyway, because it merges the response with messages that arrived over
the socket while the request was in flight.

### `POST /messages` — send

```json
{ "content": "hello", "roomId": "uuid" }
```

`201 Created` with the persisted `ChatMessage`. The API validates non-blank content and
room membership, persists, then publishes to Kafka — so the same message also arrives over
`/topic/rooms/{roomId}`, and the client deduplicates by id.

---

## STOMP destinations

Endpoint: `WS_URL` (`/ws`), SockJS, application prefix `/app`, broker prefixes `/topic` and
`/queue`.

| Frame | Destination | Payload |
|---|---|---|
| `SUBSCRIBE` | `/topic/rooms/{roomId}` | `ChatMessage` |
| `SUBSCRIBE` | `/topic/rooms/{roomId}/typing` | `TypingEvent` |
| `SEND` | `/app/typing` | `{ roomId, isTyping }` |

The client subscribes to both destinations for **every** room in `GET /rooms/me`, plus any
room created during the session.

`/app/typing` is the only frame the client sends. It deliberately omits `username`: the API
verifies membership, resolves the name from the authenticated principal, and rebroadcasts
its own `TypingEvent`. Whatever a client puts in that field is discarded.

`/queue` is enabled on the broker but unused by this client — there are no per-user
destinations yet.

---

## Errors

The API answers failures with RFC 7807 `ProblemDetail`. The client reads one field:

```ts
axiosError.response?.data?.detail ?? 'a written fallback'
```

| Situation | What the user sees |
|---|---|
| Login rejected | The API's `detail`, or "Acesso negado. Verifique seu e-mail e sua senha." |
| Registration rejected (duplicate e-mail, weak password) | The API's `detail`, or "Não foi possível criar a conta." |
| Channel creation rejected | The API's `detail`, inline in the modal |
| Send rejected | Toast, and the typed content is restored to the input |
| History or initial load rejected | Toast asking for a refresh |

A raw status code is never shown. When the API explains itself, that explanation is what
the user reads.

---

## Where the client is stricter than the API

Validation exists on both sides; these are the cases where the browser refuses first, to
avoid a round trip that can only fail:

| Rule | Enforced by |
|---|---|
| Username 3–50 characters | `minLength`/`maxLength` on the input, and the API |
| Password at least 6 characters | `minLength`, and the API |
| Password confirmation matches | **Client only** — the API never sees the second field |
| Channel name required, at most 100 characters | Client; the API allows a blank name for `DIRECT` rooms |
| At least one member selected | Client, with a specific message per case (no name, no members, neither) |
| Empty message not sent | Client (`content.trim()`), and the API (`@NotBlank`) |

The password confirmation is the only rule that exists nowhere else: it is a typing
safeguard, not a security control, and it belongs where the typing happens.
