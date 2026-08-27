# Real-time messaging

Everything the client does with the socket, and why each piece is shaped that way.

- [Transport](#transport)
- [Connection lifecycle](#connection-lifecycle)
- [Subscriptions](#subscriptions)
- [The stale-closure problem](#the-stale-closure-problem)
- [Receiving a message](#receiving-a-message)
- [Unread counts](#unread-counts)
- [Typing indicators](#typing-indicators)
- [Opening a room: the history race](#opening-a-room-the-history-race)
- [Sending](#sending)
- [Reconnection and cleanup](#reconnection-and-cleanup)

---

## Transport

STOMP frames over a SockJS connection: `@stomp/stompjs` speaks the protocol,
`sockjs-client` carries it. SockJS is what the API's `/ws` endpoint registers
(`.withSockJS()`), and it falls back to HTTP streaming or polling where a raw WebSocket
cannot be established — a corporate proxy, an old browser — without the client code
knowing.

The cost is a shim. `sockjs-client` predates bundlers and expects Node's `global`:

```html
<script>window.global = window;</script>
```

It sits in `index.html`, before the module script. A Vite `define` would work too, but the
inline assignment happens before any module is evaluated, which is the only ordering that
is certainly correct. Without it, the app builds cleanly and throws `global is not defined`
at the first connection attempt.

---

## Connection lifecycle

The client is created once per session, inside the effect that loads the initial data,
and only after the room list has arrived:

```ts
const client = new Client({
  webSocketFactory: () => new SockJS(WS_URL),
  connectHeaders: { Authorization: `Bearer ${token}` },
  reconnectDelay: 5000,
  heartbeatIncoming: 10000,
  heartbeatOutgoing: 10000,
  onConnect: () => roomList.forEach((room) => subscribeToRoom(client, room)),
  onStompError: (frame) => { /* toast */ },
});

client.activate();
clientRef.current = client;
```

| Option | Value | Why |
|---|---|---|
| `connectHeaders` | `Authorization: Bearer …` | The API authenticates the `CONNECT` frame in a channel interceptor; an unauthenticated socket never reaches the broker |
| `reconnectDelay` | 5000 | Reconnects on its own after a drop, without a reconnection loop in application code |
| `heartbeatIncoming/Outgoing` | 10000 | A silently dead connection — a laptop lid, a dropped mobile network — is detected in ~10s instead of never |

`connectWebSocket` deactivates any previous client before creating a new one, so no code
path can leave two sockets subscribed to the same topics.

**The token is read from storage at connect time, not taken from the session context.**
The socket needs the raw token, the context exposes only decoded claims, and reading the
single stored value keeps one source of truth.

---

## Subscriptions

`onConnect` subscribes to **every room the user belongs to**, not only the open one:

```ts
client.subscribe(`/topic/rooms/${room.id}`, handleMessage);
client.subscribe(`/topic/rooms/${room.id}/typing`, handleTyping);
```

Subscribing only to the active room would halve the traffic and remove the feature that
makes the app feel alive: a badge on a channel nobody is looking at. There is no
"unread since" endpoint, so unread state exists only because those frames arrive.

A room created during the session is subscribed immediately after `POST /rooms` returns,
guarded by `clientRef.current?.connected` — the channel is live before its first message
can be sent.

---

## The stale-closure problem

A subscription callback is registered once and lives as long as the socket. It closes over
whatever `activeRoom` was when it was created, which — a few room switches later — is not
the room the user is looking at. Every message would then be tested against a stale value
and either be appended to the wrong list or counted as unread while visible on screen.

The fix is a ref kept in sync with the state:

```ts
const activeRoomRef = useRef<Room | null>(null);
useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
```

The callback reads `activeRoomRef.current`; the render reads `activeRoom`. `joinRoom` also
assigns the ref **before** calling `setActiveRoom`, so a frame arriving in the same tick as
the switch is already judged against the new room.

The same reasoning applies to `clientRef`: handlers and event callbacks need the current
client instance, and a re-render must not be what makes it reachable.

---

## Receiving a message

```ts
client.subscribe(`/topic/rooms/${room.id}`, (frame) => {
  const received = JSON.parse(frame.body) as ChatMessage;
  if (activeRoomRef.current?.id === room.id) return appendMessage(received);
  if (received.senderId !== user?.id) bumpUnread(room.id);
});
```

`appendMessage` is idempotent by id:

```ts
setMessages((current) =>
  current.some((m) => m.id === received.id) ? current : [...current, received]);
```

That check is what allows the sender to append the REST response immediately *and* receive
the same message over the socket. Without it every message the user sends would appear
twice on their own screen.

The message shape mirrors the API's `MessageResponseDTO`:

```ts
interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderUsername: string;
  roomId: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
  timestamp: string;
}
```

`status` is carried, typed and currently unused — there is no endpoint that would ever move
it past `SENT`. It is documented rather than deleted because the field is real and the
feature is not.

---

## Unread counts

A count is bumped only when **both** conditions hold: the room is not the open one, and the
sender is not the current user. The second is what stops a message sent from this tab from
marking its own room unread when it comes back over the socket.

```ts
setUnreadCounts((counts) => ({ ...counts, [room.id]: (counts[room.id] ?? 0) + 1 }));
```

Opening a room resets its count to zero. The notifications dropdown is derived state — the
rooms whose count is above zero, with the total in the header badge — computed with
`useMemo` over `rooms` and `unreadCounts` rather than stored a second time.

Counts live in component state, so they reset on reload. Persisting them would mean
inventing a read model the API does not have; see [the roadmap](05-roadmap.md).

---

## Typing indicators

Outbound, on the application prefix:

```ts
client.publish({
  destination: '/app/typing',
  body: JSON.stringify({ roomId: activeRoom.id, isTyping }),
});
```

The client sends `roomId` and `isTyping`. It does **not** send the username: the API
verifies the sender is a member of that room, resolves the username from the authenticated
`Principal`, and rebroadcasts its own event to `/topic/rooms/{id}/typing`. A client cannot
make someone else appear to be typing.

The throttle is a trailing timer, not an interval:

| Event | Effect |
|---|---|
| Keystroke | Publish `true`, reset the 2s timer |
| 2s of silence | Timer fires, publishes `false` |
| Message sent | Publish `false` immediately, clear the timer |
| Unmount | Timer cleared in the effect cleanup |

Publishing `true` on every keystroke is cheap and idempotent; the state that matters is the
`false`, and tying it to silence means the indicator disappears when typing actually stops
rather than on a fixed schedule.

Incoming typing events are ignored unless they belong to the open room, and events whose
username matches the current user are dropped — the broadcast reaches the author too.

Publishing is guarded by `clientRef.current?.connected`: calling `publish` on a
disconnected client throws, and a keystroke during a reconnect must not break the input.

---

## Opening a room: the history race

`joinRoom` clears the message list and fetches the history. But the subscription is live
the whole time, so a message can arrive between the clear and the response. Naively
assigning the response would discard it.

```ts
const response = await api.get<ChatMessage[]>(`/messages/room/${room.id}`);

setMessages((arrivedWhileLoading) => {
  const byId = new Map<string, ChatMessage>();
  [...response.data, ...arrivedWhileLoading].forEach((m) => byId.set(m.id, m));
  return Array.from(byId.values())
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
});
```

Three properties come out of that: the live message is kept, a message present in both
lists appears once (the live copy wins, being written last), and the result is ordered by
timestamp rather than by arrival. The updater form is what gives access to whatever
arrived — reading the state variable would read the value captured before the `await`.

`joinRoom` also resets everything scoped to a conversation: typing users, the search query,
the emoji picker, the notifications dropdown and that room's unread count.

---

## Sending

```ts
const content = newMessage.trim();
if (!content || !activeRoom) return;

publishTyping(false);
setNewMessage('');

try {
  const response = await api.post<ChatMessage>('/messages', { content, roomId: activeRoom.id });
  if (activeRoomRef.current?.id === response.data.roomId) appendMessage(response.data);
} catch {
  setNewMessage(content);      // nothing typed is ever lost
  showFeedback('Não foi possível enviar a mensagem. Tente novamente.');
}
```

Three details matter:

- **The input clears before the request**, so typing can continue immediately; on failure
  the exact text comes back.
- **The response is appended only if the user is still in that room.** Switching rooms
  mid-flight must not inject a message into the conversation now on screen.
- **Enter sends, Shift+Enter does not.** The composer is an `<input>`, so Shift+Enter is
  reserved rather than functional — the handler is already written for the day it becomes a
  `<textarea>`.

---

## Reconnection and cleanup

`reconnectDelay: 5000` means a dropped socket comes back on its own, and `onConnect` runs
again on every reconnection — so the subscriptions are re-established without any
reconnection logic in the component. What a reconnect does **not** do is backfill: messages
sent while the socket was down are not pushed after it returns. They arrive on the next
history fetch, i.e. when the room is reopened.

The effect cleanup runs on sign-out and on unmount:

```ts
return () => {
  cancelled = true;
  clearTimeout(typingTimeoutRef.current);
  clearTimeout(feedbackTimeoutRef.current);
  void clientRef.current?.deactivate();
  clientRef.current = null;
};
```

The `cancelled` flag guards the initial fetch against setting state after unmount, which is
what makes a `StrictMode` double-mount in development harmless rather than a second socket
subscribed to every room.
