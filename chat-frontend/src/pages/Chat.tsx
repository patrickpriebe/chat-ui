import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { api } from '../services/api';
import { NexusLogo } from '../components/NexusLogo';

interface Room {
  id: string;
  name: string;
  type: string;
}

interface Message {
  id?: string;
  content: string;
  senderUsername?: string;
  timestamp?: string;
}

export function Chat() {
  const { user, signOut } = useAuth();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const [myUserId, setMyUserId] = useState<string>('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});

  const [typingUsers, setTypingUsers] = useState<{ [key: string]: boolean }>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const clientRef = useRef<Client | null>(null);
  const activeRoomRef = useRef<Room | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    async function init() {
      try {
        const usersResp = await api.get('/users');
        const usersList = usersResp.data.content ? usersResp.data.content : usersResp.data;

        if (Array.isArray(usersList)) {
          setAllUsers(usersList);
          const currentUser = usersList.find((u: any) => u.email === user?.email);
          if (currentUser) setMyUserId(currentUser.id);
        }

        const roomsResp = await api.get('/rooms');
        const roomsList = roomsResp.data.content ? roomsResp.data.content : roomsResp.data;

        if (Array.isArray(roomsList)) {
          setRooms(roomsList);
          connectUnifiedWebSocket(roomsList);
        }
      } catch (error) {
        console.error('Error initializing chat', error);
      }
    }

    init();

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [user]);

  function connectUnifiedWebSocket(roomList: Room[]) {
    const token = localStorage.getItem('@ChatApp:token');
    if (!token) return;

    if (clientRef.current) {
      clientRef.current.deactivate();
    }

    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        roomList.forEach(room => {
          client.subscribe(`/topic/rooms/${room.id}`, (message) => {
            const receivedMessage = JSON.parse(message.body);
            const myUsername = user?.email?.split('@')[0];
            const isNotMe = receivedMessage.senderUsername !== myUsername;
            const currentActive = activeRoomRef.current;

            if (currentActive && currentActive.id === room.id) {
              setMessages(prev => [...prev, receivedMessage]);
            } else if (isNotMe) {
              setUnreadCounts(prev => ({
                ...prev,
                [room.id]: (prev[room.id] || 0) + 1
              }));
            }
          });

          client.subscribe(`/topic/rooms/${room.id}/typing`, (message) => {
            const event = JSON.parse(message.body);
            const myUsername = user?.email?.split('@')[0];

            if (activeRoomRef.current?.id === room.id && event.username !== myUsername) {
              setTypingUsers(prev => ({
                ...prev,
                [event.username]: event.isTyping
              }));
            }
          });
        });
      }
    });

    client.activate();
    clientRef.current = client;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewMessage(value);

    const myUsername = user?.email?.split('@')[0];
    if (!activeRoom || !clientRef.current || !clientRef.current.connected || !myUsername) return;

    clientRef.current.publish({
      destination: '/app/typing',
      body: JSON.stringify({ roomId: activeRoom.id, username: myUsername, isTyping: true })
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      if (clientRef.current && clientRef.current.connected) {
        clientRef.current.publish({
          destination: '/app/typing',
          body: JSON.stringify({ roomId: activeRoom.id, username: myUsername, isTyping: false })
        });
      }
    }, 2000);
  }

  async function joinRoom(room: Room) {
    setActiveRoom(room);
    setMessages([]);
    setTypingUsers({});
    setUnreadCounts(prev => ({ ...prev, [room.id]: 0 }));

    try {
      const response = await api.get(`/messages/room/${room.id}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching history', error);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeRoom || !myUserId) return;

    const myUsername = user?.email?.split('@')[0];
    if (clientRef.current && clientRef.current.connected && myUsername) {
      clientRef.current.publish({
        destination: '/app/typing',
        body: JSON.stringify({ roomId: activeRoom.id, username: myUsername, isTyping: false })
      });
    }

    try {
      await api.post('/messages', {
        content: newMessage,
        senderId: myUserId,
        roomId: activeRoom.id
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message', error);
    }
  }

  async function handleCreateRoom() {
    if (!newRoomName.trim() || selectedUserIds.length === 0) {
      return alert('Give the channel a name and select at least one user!');
    }

    try {
      const response = await api.post('/rooms', {
        name: newRoomName,
        type: 'GROUP',
        memberIds: [myUserId, ...selectedUserIds]
      });

      const newRoom = response.data;
      setRooms(prev => [...prev, newRoom]);

      if (clientRef.current && clientRef.current.connected) {
        clientRef.current.subscribe(`/topic/rooms/${newRoom.id}`, (message) => {
          const receivedMessage = JSON.parse(message.body);
          const myUsername = user?.email?.split('@')[0];
          const isNotMe = receivedMessage.senderUsername !== myUsername;
          const currentActive = activeRoomRef.current;

          if (currentActive && currentActive.id === newRoom.id) {
            setMessages(prev => [...prev, receivedMessage]);
          } else if (isNotMe) {
            setUnreadCounts(prev => ({
              ...prev,
              [newRoom.id]: (prev[newRoom.id] || 0) + 1
            }));
          }
        });

        clientRef.current.subscribe(`/topic/rooms/${newRoom.id}/typing`, (message) => {
          const event = JSON.parse(message.body);
          const myUsername = user?.email?.split('@')[0];

          if (activeRoomRef.current?.id === newRoom.id && event.username !== myUsername) {
            setTypingUsers(prev => ({
              ...prev,
              [event.username]: event.isTyping
            }));
          }
        });
      }

      setNewRoomName('');
      setSelectedUserIds([]);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error creating room', error);
      alert('Error creating room.');
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  function formatTime(isoString?: string) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(name?: string) {
    if (!name) return 'U';
    return name.substring(0, 2).toUpperCase();
  }

  const currentlyTyping = Object.entries(typingUsers)
    .filter(([_, isTyping]) => isTyping)
    .map(([username]) => username);

  return (
    <div className="flex flex-col h-screen bg-background font-body-md text-on-background overflow-hidden relative">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none z-0" />

      {/* NEW ROOM MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-panel p-8 rounded-xl w-full max-w-md relative overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 left-0 w-8 h-1 bg-primary-fixed-dim" />

            <h2 className="mt-0 mb-6 font-headline-lg text-headline-lg tracking-tighter text-on-surface uppercase">
              New <span className="text-primary-fixed-dim">Channel</span>
            </h2>

            <input
              type="text"
              placeholder="Channel Name"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              className="input-cyber w-full rounded px-3 py-3 mb-6 font-code-md text-code-md text-on-surface placeholder:text-on-surface-variant/30 focus:ring-0"
            />

            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
              Users:
            </p>
            <div className="max-h-48 overflow-y-auto border border-outline-variant/30 bg-surface-container-lowest/50 p-2 mb-6 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
              {allUsers.filter(u => u.id !== myUserId).length === 0 ? (
                <p className="text-on-surface-variant/40 font-code-md text-code-md text-xs p-2">
                  No active nodes on the network.
                </p>
              ) : (
                allUsers.filter(u => u.id !== myUserId).map(u => (
                  <label
                    key={u.id}
                    className="flex items-center p-2 cursor-pointer border-b border-outline-variant/10 hover:bg-primary-container/10 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleUserSelection(u.id)}
                      className="mr-3 accent-primary-fixed-dim"
                    />
                    <span className="font-code-md text-code-md text-on-surface-variant text-xs">{u.email}</span>
                  </label>
                ))
              )}
            </div>

            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Abort
              </button>
              <button
                onClick={handleCreateRoom}
                className="btn-primary-cyber px-6 py-2 rounded font-label-caps text-label-caps font-bold uppercase"
              >
                Establish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP NAVBAR */}
      <header className="h-16 shrink-0 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)] flex items-center justify-between px-6 md:px-margin-desktop relative z-30">
        <div className="flex items-center gap-3">
          <NexusLogo className="h-8 w-8 text-primary-fixed-dim drop-shadow-[0_0_10px_rgba(0,219,233,0.5)]" />
          <span className="font-display-lg text-headline-lg-mobile md:text-headline-lg font-bold text-primary-fixed-dim drop-shadow-[0_0_10px_rgba(0,219,233,0.5)] tracking-tighter">
            NEXUS
          </span>
        </div>
        <nav className="hidden md:flex gap-8">
          <span className="font-headline-lg-mobile text-sm tracking-tight text-on-surface-variant/60 cursor-default">
            Network
          </span>
          <span className="font-headline-lg-mobile text-sm tracking-tight text-primary-fixed-dim border-b-2 border-primary-fixed-dim pb-1 cursor-default">
            Channels
          </span>
          <span className="font-headline-lg-mobile text-sm tracking-tight text-on-surface-variant/60 cursor-default">
            Direct
          </span>
          <span className="font-headline-lg-mobile text-sm tracking-tight text-on-surface-variant/60 cursor-default">
            Vault
          </span>
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex relative">
            <input
              placeholder="Search Data..."
              className="bg-surface-container-high/60 border-b border-outline-variant/30 text-body-sm font-body-sm px-4 py-2 w-48 lg:w-64 focus:outline-none focus:border-primary-fixed-dim focus:ring-0 bg-transparent text-on-surface placeholder:text-on-surface-variant/50"
            />
            <span className="material-symbols-outlined absolute right-2 top-2 text-on-surface-variant/50 !text-[18px] pointer-events-none">
              search
            </span>
          </div>
          <button className="text-on-surface-variant/60 hover:text-primary-fixed-dim transition-colors">
            <span className="material-symbols-outlined !text-[20px]">notifications</span>
          </button>
          <button className="text-on-surface-variant/60 hover:text-primary-fixed-dim transition-colors">
            <span className="material-symbols-outlined !text-[20px]">settings</span>
          </button>
          <div className="w-8 h-8 rounded-full border border-outline-variant/30 flex items-center justify-center bg-surface-container-high font-code-md text-code-md text-on-surface-variant text-xs">
            {getInitials(user?.email?.split('@')[0])}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* SIDEBAR (Mainframe / Channels) */}
        <aside className="w-72 shrink-0 border-r border-outline-variant/10 bg-surface-container-lowest/50 backdrop-blur-2xl flex flex-col z-20 hidden md:flex">
          <div className="p-6 border-b border-outline-variant/10 bg-surface-container-low/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded flex items-center justify-center border border-primary-fixed-dim/30 bg-primary-container/5">
                <NexusLogo className="h-6 w-6 text-primary-fixed-dim" />
              </div>
              <div className="min-w-0">
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary-fixed-dim leading-none truncate">
                  Mainframe
                </h2>
                <span className="font-code-md text-code-md text-on-surface-variant/50 text-[10px] flex items-center gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim animate-pulse shrink-0" />
                  <span className="truncate">{user?.email?.split('@')[0]}</span>
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full bg-primary-container/10 border border-primary-fixed-dim text-primary-fixed-dim hover:bg-primary-container/20 transition-all duration-300 py-2 rounded font-label-caps text-label-caps flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined !text-[16px]">add</span> New Uplink
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
            {rooms.length === 0 ? (
              <p className="px-6 py-4 text-on-surface-variant/40 font-code-md text-code-md text-xs">
                No channels available.
              </p>
            ) : (
              rooms.map(room => {
                const unreadCount = unreadCounts[room.id] || 0;
                const isActive = activeRoom?.id === room.id;

                return (
                  <button
                    key={room.id}
                    onClick={() => joinRoom(room)}
                    className={`w-full flex items-center justify-between gap-3 px-6 py-3 text-left transition-all duration-200
                      ${isActive
                        ? 'bg-primary-container/10 text-primary-fixed-dim border-l-4 border-l-primary-fixed-dim'
                        : 'text-on-surface-variant/60 border-l-4 border-l-transparent hover:bg-white/5 hover:text-primary-fixed'}`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="material-symbols-outlined !text-[20px] shrink-0">
                        {room.type === 'GROUP' ? 'tag' : 'person'}
                      </span>
                      <span className="font-body-sm text-body-sm truncate">{room.name}</span>
                    </span>
                    {unreadCount > 0 && (
                      <span className="shrink-0 bg-primary-fixed-dim text-on-primary-fixed rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-code-md font-bold">
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
              onClick={signOut}
              className="w-full font-body-sm text-body-sm text-on-surface-variant/50 flex items-center gap-3 px-2 py-2 hover:bg-white/5 hover:text-error rounded transition-colors duration-200"
            >
              <span className="material-symbols-outlined !text-[20px]">logout</span> Disconnect
            </button>
          </div>
        </aside>

        {/* MAIN CHAT AREA */}
        <main className="flex-1 flex flex-col relative min-w-0">
          {!activeRoom ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center opacity-40 px-6">
                <div className="w-24 h-24 border border-outline-variant/40 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="material-symbols-outlined !text-[36px] text-on-surface-variant">forum</span>
                </div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile uppercase tracking-widest text-on-surface-variant mb-2">
                  Aetheric Uplink
                </h2>
                <p className="font-code-md text-code-md text-on-surface-variant/60">
                  Awaiting channel selection...
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Room Header */}
              <header className="h-16 border-b border-outline-variant/10 glass-panel flex items-center px-6 justify-between shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="material-symbols-outlined text-primary-fixed-dim shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {activeRoom.type === 'GROUP' ? 'tag' : 'person'}
                  </span>
                  <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight truncate">
                    {activeRoom.name}
                  </h1>
                  <span className="font-label-caps text-label-caps bg-surface-variant text-on-surface-variant px-2 py-1 rounded ml-2 shrink-0">
                    {activeRoom.type}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-on-surface-variant/60 shrink-0">
                  <button className="hover:text-primary-fixed-dim transition-colors">
                    <span className="material-symbols-outlined !text-[20px]">search</span>
                  </button>
                </div>
              </header>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-2 relative z-0 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
                {messages.map((msg, index) => {
                  const isMe = msg.senderUsername === user?.email?.split('@')[0];
                  return (
                    <div
                      key={msg.id ?? index}
                      className="group flex gap-4 w-full max-w-3xl hover:bg-white/[0.02] p-2 -ml-2 rounded transition-colors"
                    >
                      <div
                        className={`w-10 h-10 rounded flex items-center justify-center font-code-md text-code-md shrink-0 border
                          ${isMe
                            ? 'border-primary-fixed-dim/40 text-primary-fixed-dim bg-primary-container/5'
                            : 'border-outline-variant/30 text-on-surface-variant bg-surface-container-high'}`}
                      >
                        {getInitials(msg.senderUsername)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span
                            className={`font-body-md text-body-md font-bold ${isMe ? 'text-primary-fixed-dim' : 'text-on-surface'}`}
                          >
                            {isMe ? 'You' : msg.senderUsername}
                          </span>
                          <span className="font-code-md text-code-md text-on-surface-variant/40 text-xs">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="font-body-md text-body-md text-on-surface-variant break-words">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Footer / Input */}
              <div className="p-4 bg-surface-container-lowest/80 backdrop-blur-xl border-t border-outline-variant/10 z-10 shrink-0 relative">
                {currentlyTyping.length > 0 && (
                  <div className="max-w-3xl mx-auto mb-2 text-[10px] text-primary-fixed-dim font-code-md flex items-center gap-2">
                    <span className="w-1 h-1 bg-primary-fixed-dim animate-ping rounded-full" />
                    {currentlyTyping.join(', ')}{' '}
                    {currentlyTyping.length > 1 ? 'are transmitting data...' : 'is transmitting data...'}
                  </div>
                )}

                <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-surface-container-low border border-outline-variant/30 rounded-xl p-2 focus-within:border-primary-fixed-dim/50 focus-within:ring-1 focus-within:ring-primary-fixed-dim/20 transition-all duration-300">
                  <button className="p-2 text-on-surface-variant/50 hover:text-primary-fixed-dim transition-colors rounded-lg hover:bg-white/5 shrink-0">
                    <span className="material-symbols-outlined">add_circle</span>
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={handleInputChange}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Transmit message to The Nexus..."
                    className="w-full bg-transparent border-none focus:ring-0 text-body-md text-on-surface placeholder:text-on-surface-variant/40 py-2 font-body-md"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="p-2 text-on-surface-variant/50 hover:text-primary-fixed-dim transition-colors rounded-lg hover:bg-white/5 hidden sm:block">
                      <span className="material-symbols-outlined">sentiment_satisfied</span>
                    </button>
                    <button
                      onClick={sendMessage}
                      className="p-2 bg-primary-fixed-dim/10 text-primary-fixed-dim hover:bg-primary-fixed-dim hover:text-on-primary-fixed border border-primary-fixed-dim/30 transition-all duration-300 rounded-lg neon-glow ml-1"
                    >
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                        send
                      </span>
                    </button>
                  </div>
                </div>
                <div className="max-w-3xl mx-auto mt-2 flex justify-between items-center px-2">
                  <span className="font-code-md text-code-md text-on-surface-variant/40 text-[10px]">
                    <strong>Enter</strong> to send
                  </span>
                  <span className="font-code-md text-code-md text-primary-fixed-dim/60 text-[10px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-primary-fixed-dim rounded-full animate-pulse" /> Uplink Secure
                  </span>
                </div>
              </div>
            </>
          )}
        </main>

        {/* RIGHT SIDEBAR (Node Details) */}
        {activeRoom && (
          <aside className="w-72 shrink-0 border-l border-outline-variant/10 bg-surface-container-lowest/30 hidden lg:flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
            <div className="p-6 border-b border-outline-variant/10">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant tracking-widest mb-4">
                NODE DETAILS
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
                  {activeRoom.type === 'GROUP' ? 'Group Channel' : 'Direct Connection'}
                </p>
              </div>
            </div>

            <div className="p-6">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant tracking-widest mb-4 flex justify-between items-center">
                PARTICIPANTS
                <span className="text-primary-fixed-dim bg-primary-fixed-dim/10 px-2 py-0.5 rounded">
                  {allUsers.length}
                </span>
              </h3>
              <div className="space-y-4">
                {allUsers.map(u => {
                  const isSelf = u.id === myUserId;
                  return (
                    <div key={u.id} className="flex items-center gap-3 group">
                      <div className="relative">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center font-code-md text-code-md text-xs border
                            ${isSelf ? 'border-primary-fixed-dim/50 text-primary-fixed-dim' : 'border-outline-variant/30 text-on-surface-variant'}`}
                        >
                          {getInitials(u.email)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary-fixed-dim rounded-full border-2 border-surface-container-lowest" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body-sm text-body-sm text-on-surface truncate">
                          {u.email}
                          {isSelf ? ' (you)' : ''}
                        </p>
                        <p className="font-code-md text-code-md text-on-surface-variant/50 text-[10px] truncate">
                          Node
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
