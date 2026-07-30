import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from '../contexts/AuthContext';
import { api, WS_URL } from '../services/api';
import { NexoraLogo } from '../components/NexoraLogo';
import { TOKEN_KEY } from '../auth/session';

interface UserSummary {
  id: string;
  username: string;
  email: string;
}

interface Room {
  id: string;
  name: string;
  type: 'DIRECT' | 'GROUP';
  members: UserSummary[];
}

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderUsername: string;
  roomId: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
  timestamp: string;
}

interface TypingEvent {
  roomId: string;
  username: string;
  isTyping: boolean;
}

const EMOJIS = [
  '😀',
  '😂',
  '😊',
  '😍',
  '🤔',
  '😎',
  '😢',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙏',
  '🔥',
  '🎉',
  '❤️',
  '💡',
  '✅',
  '🚀',
  '👀',
  '💬',
];

function getInitials(value?: string) {
  if (!value) return 'U';

  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatTime(isoString?: string) {
  if (!isoString) return '';

  return new Date(isoString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedMessage({
  content,
  query,
}: {
  content: string;
  query: string;
}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return <>{content}</>;

  const expression = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi');
  const parts = content.split(expression);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === normalizedQuery.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="bg-primary-fixed-dim/80 text-on-primary-fixed rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

export function Chat() {
  const { user, signOut } = useAuth();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const clientRef = useRef<Client | null>(null);
  const activeRoomRef = useRef<Room | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  const appendMessage = useCallback((receivedMessage: ChatMessage) => {
    setMessages((currentMessages) => {
      if (currentMessages.some((message) => message.id === receivedMessage.id)) {
        return currentMessages;
      }

      return [...currentMessages, receivedMessage];
    });
  }, []);

  const subscribeToRoom = useCallback(
    (client: Client, room: Room) => {
      client.subscribe(`/topic/rooms/${room.id}`, (stompMessage) => {
        const receivedMessage = JSON.parse(stompMessage.body) as ChatMessage;
        const currentRoom = activeRoomRef.current;

        if (currentRoom?.id === room.id) {
          appendMessage(receivedMessage);
          return;
        }

        if (receivedMessage.senderId !== user?.id) {
          setUnreadCounts((currentCounts) => ({
            ...currentCounts,
            [room.id]: (currentCounts[room.id] ?? 0) + 1,
          }));
        }
      });

      client.subscribe(`/topic/rooms/${room.id}/typing`, (stompMessage) => {
        const event = JSON.parse(stompMessage.body) as TypingEvent;

        if (
          activeRoomRef.current?.id === room.id &&
          event.username !== user?.username
        ) {
          setTypingUsers((currentUsers) => ({
            ...currentUsers,
            [event.username]: event.isTyping,
          }));
        }
      });
    },
    [appendMessage, user?.id, user?.username],
  );

  const connectWebSocket = useCallback(
    (roomList: Room[]) => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;

      void clientRef.current?.deactivate();

      const client = new Client({
        webSocketFactory: () => new SockJS(WS_URL),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        onConnect: () => {
          roomList.forEach((room) => subscribeToRoom(client, room));
        },
        onStompError: (frame) => {
          console.error('Falha na conexão STOMP:', frame.headers.message);
        },
      });

      client.activate();
      clientRef.current = client;
    },
    [subscribeToRoom],
  );

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function initializeChat() {
      try {
        const [usersResponse, roomsResponse] = await Promise.all([
          api.get<UserSummary[]>('/users'),
          api.get<Room[]>('/rooms/me'),
        ]);

        if (cancelled) return;

        setAllUsers(usersResponse.data);
        setRooms(roomsResponse.data);
        connectWebSocket(roomsResponse.data);
      } catch (error) {
        console.error('Erro ao inicializar o chat:', error);
      }
    }

    void initializeChat();

    return () => {
      cancelled = true;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      void clientRef.current?.deactivate();
      clientRef.current = null;
    };
  }, [connectWebSocket, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return messages;

    return messages.filter(
      (message) =>
        message.content.toLowerCase().includes(query) ||
        message.senderUsername.toLowerCase().includes(query),
    );
  }, [messageSearch, messages]);

  const currentlyTyping = Object.entries(typingUsers)
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);

  const notificationRooms = useMemo(
    () =>
      rooms
        .map((room) => ({
          room,
          count: unreadCounts[room.id] ?? 0,
        }))
        .filter((notification) => notification.count > 0),
    [rooms, unreadCounts],
  );

  const totalUnread = notificationRooms.reduce(
    (total, notification) => total + notification.count,
    0,
  );

  function publishTyping(isTyping: boolean) {
    if (
      !activeRoom ||
      !clientRef.current ||
      !clientRef.current.connected
    ) {
      return;
    }

    clientRef.current.publish({
      destination: '/app/typing',
      body: JSON.stringify({
        roomId: activeRoom.id,
        isTyping,
      }),
    });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setNewMessage(event.target.value);
    publishTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => publishTyping(false), 2000);
  }

  async function joinRoom(room: Room) {
    activeRoomRef.current = room;
    setActiveRoom(room);
    setMessages([]);
    setTypingUsers({});
    setMessageSearch('');
    setIsMessageSearchOpen(false);
    setIsEmojiPickerOpen(false);
    setIsNotificationsOpen(false);
    setUnreadCounts((currentCounts) => ({
      ...currentCounts,
      [room.id]: 0,
    }));

    try {
      const response = await api.get<ChatMessage[]>(`/messages/room/${room.id}`);
      setMessages((messagesReceivedWhileLoading) => {
        const messagesById = new Map<string, ChatMessage>();

        [...response.data, ...messagesReceivedWhileLoading].forEach((message) => {
          messagesById.set(message.id, message);
        });

        return Array.from(messagesById.values()).sort(
          (firstMessage, secondMessage) =>
            new Date(firstMessage.timestamp).getTime() -
            new Date(secondMessage.timestamp).getTime(),
        );
      });
    } catch (error) {
      console.error('Erro ao buscar o histórico da sala:', error);
    }
  }

  async function sendMessage() {
    const content = newMessage.trim();
    if (!content || !activeRoom) return;

    publishTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setNewMessage('');
    setIsEmojiPickerOpen(false);

    try {
      const response = await api.post<ChatMessage>('/messages', {
        content,
        roomId: activeRoom.id,
      });

      if (activeRoomRef.current?.id === response.data.roomId) {
        appendMessage(response.data);
      }
    } catch (error) {
      setNewMessage(content);
      console.error('Erro ao enviar a mensagem:', error);
    }
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function addEmoji(emoji: string) {
    const input = messageInputRef.current;
    const selectionStart = input?.selectionStart ?? newMessage.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const updatedMessage =
      newMessage.slice(0, selectionStart) +
      emoji +
      newMessage.slice(selectionEnd);

    setNewMessage(updatedMessage);
    setIsEmojiPickerOpen(false);

    requestAnimationFrame(() => {
      const cursorPosition = selectionStart + emoji.length;
      input?.focus();
      input?.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  async function handleCreateRoom() {
    if (!newRoomName.trim() || selectedUserIds.length === 0) {
      window.alert('Informe o nome do canal e selecione pelo menos um usuário.');
      return;
    }

    try {
      const response = await api.post<Room>('/rooms', {
        name: newRoomName.trim(),
        type: 'GROUP',
        memberIds: selectedUserIds,
      });

      const newRoom = response.data;
      setRooms((currentRooms) => [...currentRooms, newRoom]);

      if (clientRef.current?.connected) {
        subscribeToRoom(clientRef.current, newRoom);
      }

      setNewRoomName('');
      setSelectedUserIds([]);
      setIsRoomModalOpen(false);
      await joinRoom(newRoom);
    } catch (error) {
      console.error('Erro ao criar o canal:', error);
      window.alert('Não foi possível criar o canal.');
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUserIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background font-body-md text-on-background overflow-hidden relative">
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none z-0" />

      {isRoomModalOpen && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-panel p-8 rounded-xl w-full max-w-md relative overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 left-0 w-8 h-1 bg-primary-fixed-dim" />

            <h2 className="mt-0 mb-6 font-headline-lg text-headline-lg tracking-tighter text-on-surface uppercase">
              Novo <span className="text-primary-fixed-dim">canal</span>
            </h2>

            <input
              type="text"
              placeholder="Nome do canal"
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              className="input-cyber w-full rounded px-3 py-3 mb-6 font-code-md text-code-md text-on-surface placeholder:text-on-surface-variant/30 focus:ring-0"
              maxLength={100}
            />

            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
              Participantes
            </p>
            <div className="max-h-48 overflow-y-auto border border-outline-variant/30 bg-surface-container-lowest/50 p-2 mb-6">
              {allUsers.filter((availableUser) => availableUser.id !== user?.id)
                .length === 0 ? (
                <p className="text-on-surface-variant/40 font-code-md text-code-md text-xs p-2">
                  Nenhum outro usuário disponível.
                </p>
              ) : (
                allUsers
                  .filter((availableUser) => availableUser.id !== user?.id)
                  .map((availableUser) => (
                    <label
                      key={availableUser.id}
                      className="flex items-center p-2 cursor-pointer border-b border-outline-variant/10 hover:bg-primary-container/10 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(availableUser.id)}
                        onChange={() =>
                          toggleUserSelection(availableUser.id)
                        }
                        className="mr-3 accent-primary-fixed-dim"
                      />
                      <span className="font-code-md text-code-md text-on-surface-variant text-xs min-w-0">
                        <strong className="block text-on-surface truncate">
                          {availableUser.username}
                        </strong>
                        <span className="block truncate">
                          {availableUser.email}
                        </span>
                      </span>
                    </label>
                  ))
              )}
            </div>

            <div className="flex gap-4 justify-end">
              <button
                type="button"
                onClick={() => setIsRoomModalOpen(false)}
                className="px-6 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateRoom()}
                className="btn-primary-cyber px-6 py-2 rounded font-label-caps text-label-caps font-bold uppercase"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="h-16 shrink-0 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)] flex items-center justify-between px-4 md:px-margin-desktop relative z-40">
        <NexoraLogo className="h-10 w-48 md:w-56 shrink-0" />

        <nav className="hidden md:flex">
          <span className="font-headline-lg-mobile text-sm tracking-tight text-primary-fixed-dim border-b-2 border-primary-fixed-dim pb-1 cursor-default">
            Channels
          </span>
        </nav>

        <div className="flex items-center gap-3">
          <select
            aria-label="Selecionar canal"
            className="md:hidden max-w-32 bg-surface-container-high border border-outline-variant/30 rounded px-2 py-1 text-xs text-on-surface"
            value={activeRoom?.id ?? ''}
            onChange={(event) => {
              const selectedRoom = rooms.find(
                (room) => room.id === event.target.value,
              );
              if (selectedRoom) void joinRoom(selectedRoom);
            }}
          >
            <option value="">Canal</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              aria-label="Notificações"
              aria-expanded={isNotificationsOpen}
              onClick={() =>
                setIsNotificationsOpen((currentValue) => !currentValue)
              }
              className="relative p-2 text-on-surface-variant/70 hover:text-primary-fixed-dim transition-colors"
            >
              <span className="material-symbols-outlined !text-[22px]">
                notifications
              </span>
              {totalUnread > 0 && (
                <span className="absolute top-0 right-0 min-w-4 h-4 px-1 rounded-full bg-primary-fixed-dim text-on-primary-fixed text-[9px] font-bold flex items-center justify-center">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] glass-panel rounded-lg shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-outline-variant/20 flex justify-between items-center">
                  <h2 className="font-label-caps text-label-caps uppercase text-on-surface">
                    Notificações
                  </h2>
                  <span className="text-[10px] text-primary-fixed-dim font-code-md">
                    {totalUnread} não lidas
                  </span>
                </div>

                {notificationRooms.length === 0 ? (
                  <p className="p-5 text-sm text-on-surface-variant/60 text-center">
                    Nenhuma mensagem nova.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {notificationRooms.map(({ room, count }) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => void joinRoom(room)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-primary-container/10 border-b border-outline-variant/10 transition-colors"
                      >
                        <span className="w-9 h-9 rounded border border-primary-fixed-dim/30 flex items-center justify-center text-primary-fixed-dim shrink-0">
                          <span className="material-symbols-outlined !text-[18px]">
                            {room.type === 'GROUP' ? 'tag' : 'person'}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm text-on-surface truncate">
                            {room.name}
                          </strong>
                          <span className="block text-xs text-on-surface-variant/60">
                            {count} {count === 1 ? 'mensagem nova' : 'mensagens novas'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            title={user?.username}
            className="w-9 h-9 rounded-full border border-primary-fixed-dim/30 flex items-center justify-center bg-primary-container/5 font-code-md text-code-md text-primary-fixed-dim text-xs"
          >
            {getInitials(user?.username)}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10">
        <aside className="w-72 shrink-0 border-r border-outline-variant/10 bg-surface-container-lowest/50 backdrop-blur-2xl flex-col z-20 hidden md:flex">
          <div className="p-6 border-b border-outline-variant/10 bg-surface-container-low/30">
            <div className="mb-4">
              <span className="font-code-md text-code-md text-on-surface-variant/50 text-[10px] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim animate-pulse shrink-0" />
                <span className="truncate">
                  {user?.username} · {user?.email}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsRoomModalOpen(true)}
              className="w-full bg-primary-container/10 border border-primary-fixed-dim text-primary-fixed-dim hover:bg-primary-container/20 transition-all duration-300 py-2 rounded font-label-caps text-label-caps flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined !text-[16px]">add</span>
              Novo canal
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {rooms.length === 0 ? (
              <p className="px-6 py-4 text-on-surface-variant/40 font-code-md text-code-md text-xs">
                Nenhum canal disponível.
              </p>
            ) : (
              rooms.map((room) => {
                const unreadCount = unreadCounts[room.id] ?? 0;
                const isActive = activeRoom?.id === room.id;

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => void joinRoom(room)}
                    className={`w-full flex items-center justify-between gap-3 px-6 py-3 text-left transition-all duration-200 ${
                      isActive
                        ? 'bg-primary-container/10 text-primary-fixed-dim border-l-4 border-l-primary-fixed-dim'
                        : 'text-on-surface-variant/60 border-l-4 border-l-transparent hover:bg-white/5 hover:text-primary-fixed'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="material-symbols-outlined !text-[20px] shrink-0">
                        {room.type === 'GROUP' ? 'tag' : 'person'}
                      </span>
                      <span className="font-body-sm text-body-sm truncate">
                        {room.name}
                      </span>
                    </span>
                    {unreadCount > 0 && (
                      <span className="shrink-0 bg-primary-fixed-dim text-on-primary-fixed rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center text-[10px] font-code-md font-bold">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </nav>

          <div className="mt-auto border-t border-outline-variant/10 p-4">
            <button
              type="button"
              onClick={signOut}
              className="w-full font-body-sm text-body-sm text-on-surface-variant/50 flex items-center gap-3 px-2 py-2 hover:bg-white/5 hover:text-error rounded transition-colors duration-200"
            >
              <span className="material-symbols-outlined !text-[20px]">
                logout
              </span>
              Sair
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative min-w-0">
          {!activeRoom ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center opacity-50 px-6">
                <div className="w-24 h-24 border border-outline-variant/40 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="material-symbols-outlined !text-[36px] text-primary-fixed-dim">
                    forum
                  </span>
                </div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile uppercase tracking-widest text-on-surface-variant mb-2">
                  NEXORA
                </h2>
                <p className="font-code-md text-code-md text-on-surface-variant/60">
                  Selecione um canal para iniciar.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="min-h-16 border-b border-outline-variant/10 glass-panel flex items-center px-4 md:px-6 justify-between shrink-0 z-10 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-primary-fixed-dim shrink-0">
                    {activeRoom.type === 'GROUP' ? 'tag' : 'person'}
                  </span>
                  <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight truncate">
                    {activeRoom.name}
                  </h1>
                  <span className="hidden sm:inline font-label-caps text-label-caps bg-surface-variant text-on-surface-variant px-2 py-1 rounded ml-2 shrink-0">
                    {activeRoom.type}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 min-w-0">
                  {isMessageSearchOpen && (
                    <div className="relative flex items-center">
                      <input
                        autoFocus
                        type="search"
                        aria-label="Buscar nas mensagens"
                        placeholder="Buscar neste canal..."
                        value={messageSearch}
                        onChange={(event) => setMessageSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setMessageSearch('');
                            setIsMessageSearchOpen(false);
                          }
                        }}
                        className="w-40 sm:w-64 bg-surface-container-high/80 border border-outline-variant/30 rounded pl-3 pr-9 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary-fixed-dim"
                      />
                      <span className="absolute right-2 text-[10px] font-code-md text-primary-fixed-dim pointer-events-none">
                        {messageSearch.trim() ? visibleMessages.length : ''}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    aria-label={
                      isMessageSearchOpen
                        ? 'Fechar busca de mensagens'
                        : 'Buscar nas mensagens'
                    }
                    onClick={() => {
                      if (isMessageSearchOpen) setMessageSearch('');
                      setIsMessageSearchOpen((currentValue) => !currentValue);
                    }}
                    className={`p-2 transition-colors ${
                      isMessageSearchOpen
                        ? 'text-primary-fixed-dim'
                        : 'text-on-surface-variant/60 hover:text-primary-fixed-dim'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[20px]">
                      {isMessageSearchOpen ? 'close' : 'search'}
                    </span>
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 relative z-0">
                {visibleMessages.length === 0 && messageSearch.trim() ? (
                  <div className="h-full flex items-center justify-center text-on-surface-variant/50 font-code-md text-sm">
                    Nenhuma mensagem encontrada.
                  </div>
                ) : (
                  visibleMessages.map((message) => {
                    const isMine = message.senderId === user?.id;

                    return (
                      <div
                        key={message.id}
                        className="group flex gap-4 w-full max-w-3xl hover:bg-white/[0.02] p-2 -ml-2 rounded transition-colors"
                      >
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center font-code-md text-code-md shrink-0 border ${
                            isMine
                              ? 'border-primary-fixed-dim/40 text-primary-fixed-dim bg-primary-container/5'
                              : 'border-outline-variant/30 text-on-surface-variant bg-surface-container-high'
                          }`}
                        >
                          {getInitials(message.senderUsername)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span
                              className={`font-body-md text-body-md font-bold ${
                                isMine
                                  ? 'text-primary-fixed-dim'
                                  : 'text-on-surface'
                              }`}
                            >
                              {isMine ? 'Você' : message.senderUsername}
                            </span>
                            <span className="font-code-md text-code-md text-on-surface-variant/40 text-xs">
                              {formatTime(message.timestamp)}
                            </span>
                          </div>
                          <p className="font-body-md text-body-md text-on-surface-variant break-words whitespace-pre-wrap">
                            <HighlightedMessage
                              content={message.content}
                              query={messageSearch}
                            />
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-surface-container-lowest/80 backdrop-blur-xl border-t border-outline-variant/10 z-10 shrink-0 relative">
                {currentlyTyping.length > 0 && (
                  <div className="max-w-3xl mx-auto mb-2 text-[10px] text-primary-fixed-dim font-code-md flex items-center gap-2">
                    <span className="w-1 h-1 bg-primary-fixed-dim animate-ping rounded-full" />
                    {currentlyTyping.join(', ')}{' '}
                    {currentlyTyping.length > 1
                      ? 'estão digitando...'
                      : 'está digitando...'}
                  </div>
                )}

                <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-surface-container-low border border-outline-variant/30 rounded-xl p-2 focus-within:border-primary-fixed-dim/50 focus-within:ring-1 focus-within:ring-primary-fixed-dim/20 transition-all duration-300">
                  <input
                    ref={messageInputRef}
                    type="text"
                    value={newMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleMessageKeyDown}
                    placeholder="Digite uma mensagem..."
                    maxLength={10000}
                    className="w-full bg-transparent border-none focus:ring-0 text-body-md text-on-surface placeholder:text-on-surface-variant/40 py-2 px-2 font-body-md"
                  />

                  <div className="flex items-center gap-1 shrink-0 relative">
                    <button
                      type="button"
                      aria-label="Selecionar emoji"
                      aria-expanded={isEmojiPickerOpen}
                      onClick={() =>
                        setIsEmojiPickerOpen((currentValue) => !currentValue)
                      }
                      className={`p-2 transition-colors rounded-lg hover:bg-white/5 ${
                        isEmojiPickerOpen
                          ? 'text-primary-fixed-dim'
                          : 'text-on-surface-variant/50 hover:text-primary-fixed-dim'
                      }`}
                    >
                      <span className="material-symbols-outlined">
                        sentiment_satisfied
                      </span>
                    </button>

                    {isEmojiPickerOpen && (
                      <div className="absolute bottom-14 right-0 w-64 glass-panel rounded-lg p-3 shadow-2xl grid grid-cols-5 gap-1 z-30">
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => addEmoji(emoji)}
                            className="h-10 text-xl rounded hover:bg-primary-container/10 hover:scale-110 transition-all"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      aria-label="Enviar mensagem"
                      onClick={() => void sendMessage()}
                      disabled={!newMessage.trim()}
                      className="p-2 bg-primary-fixed-dim/10 text-primary-fixed-dim hover:bg-primary-fixed-dim hover:text-on-primary-fixed border border-primary-fixed-dim/30 transition-all duration-300 rounded-lg neon-glow ml-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined">send</span>
                    </button>
                  </div>
                </div>

                <div className="max-w-3xl mx-auto mt-2 flex justify-between items-center px-2">
                  <span className="font-code-md text-code-md text-on-surface-variant/40 text-[10px]">
                    <strong>Enter</strong> para enviar
                  </span>
                  <span className="font-code-md text-code-md text-primary-fixed-dim/60 text-[10px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-primary-fixed-dim rounded-full animate-pulse" />
                    Conexão segura
                  </span>
                </div>
              </div>
            </>
          )}
        </main>

        {activeRoom && (
          <aside className="w-72 shrink-0 border-l border-outline-variant/10 bg-surface-container-lowest/30 hidden lg:flex flex-col overflow-y-auto">
            <div className="p-6 border-b border-outline-variant/10">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant tracking-widest mb-4">
                DETALHES DO CANAL
              </h3>
              <div className="glass-panel p-4 rounded-lg flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary-container/10 border-2 border-primary-fixed-dim/30 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-primary-fixed-dim !text-3xl">
                    {activeRoom.type === 'GROUP' ? 'hub' : 'person'}
                  </span>
                </div>
                <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
                  {activeRoom.name}
                </h4>
                <p className="font-body-sm text-body-sm text-on-surface-variant/60 mt-1">
                  {activeRoom.type === 'GROUP'
                    ? 'Canal em grupo'
                    : 'Conversa direta'}
                </p>
              </div>
            </div>

            <div className="p-6">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant tracking-widest mb-4 flex justify-between items-center">
                PARTICIPANTES
                <span className="text-primary-fixed-dim bg-primary-fixed-dim/10 px-2 py-0.5 rounded">
                  {activeRoom.members.length}
                </span>
              </h3>
              <div className="space-y-4">
                {activeRoom.members.map((member) => {
                  const isSelf = member.id === user?.id;

                  return (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center font-code-md text-code-md text-xs border ${
                            isSelf
                              ? 'border-primary-fixed-dim/50 text-primary-fixed-dim'
                              : 'border-outline-variant/30 text-on-surface-variant'
                          }`}
                        >
                          {getInitials(member.username)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary-fixed-dim rounded-full border-2 border-surface-container-lowest" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body-sm text-body-sm text-on-surface truncate">
                          {member.username}
                          {isSelf ? ' (você)' : ''}
                        </p>
                        <p className="font-code-md text-code-md text-on-surface-variant/50 text-[10px] truncate">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}