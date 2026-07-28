import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { api } from '../services/api';

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

  // Estado para rastrear quem está digitando na sala ativa { [username]: boolean }
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: boolean }>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Refs para gerenciar o cliente único e evitar stale closures no WebSocket
  const clientRef = useRef<Client | null>(null);
  const activeRoomRef = useRef<Room | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mantém a ref da sala ativa sempre atualizada em tempo real
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // 1. Carrega dados iniciais e conecta o WebSocket UMA ÚNICA VEZ
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
        console.error('Erro ao inicializar chat', error);
      }
    }

    init();

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [user]);

  // Conecta um único cliente STOMP e se inscreve em todas as salas (Mensagens e Digitação)
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
          // Inscrição para o canal de mensagens da sala
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

          // Inscrição para o canal de digitação da sala
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

  // Função executada a cada tecla digitada no input
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewMessage(value);

    const myUsername = user?.email?.split('@')[0];
    if (!activeRoom || !clientRef.current || !clientRef.current.connected || !myUsername) return;

    // Publica no backend que o usuário começou a digitar
    clientRef.current.publish({
      destination: '/app/typing',
      body: JSON.stringify({ roomId: activeRoom.id, username: myUsername, isTyping: true })
    });

    // Reseta o temporizador para enviar que parou de digitar após 2 segundos de inatividade
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

  // Ao clicar em uma sala, busca o histórico, limpa o typing e zera as não lidas
  async function joinRoom(room: Room) {
    setActiveRoom(room);
    setMessages([]);
    setTypingUsers({});
    setUnreadCounts(prev => ({ ...prev, [room.id]: 0 }));

    try {
      const response = await api.get(`/messages/room/${room.id}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Erro ao buscar histórico', error);
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
      console.error('Erro ao enviar mensagem', error);
    }
  }

  async function handleCreateRoom() {
    if (!newRoomName.trim() || selectedUserIds.length === 0) {
      return alert('Dê um nome para a sala e selecione pelo menos um usuário!');
    }

    try {
      const response = await api.post('/rooms', {
        name: newRoomName,
        type: 'GROUP', 
        memberIds: [myUserId, ...selectedUserIds]
      });

      const newRoom = response.data;
      setRooms(prev => [...prev, newRoom]);
      
      // Inscreve a nova sala nos canais de mensagem e digitação do cliente STOMP ativo
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
      console.error('Erro ao criar sala', error);
      alert('Erro ao criar sala.');
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
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(name?: string) {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  }

  // Lista quem está digitando no momento na sala ativa
  const currentlyTyping = Object.entries(typingUsers)
    .filter(([_, isTyping]) => isTyping)
    .map(([username]) => username);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* MODAL DE NOVA SALA */}
      {isModalOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', width: '400px', maxWidth: '90%' }}>
            <h2 style={{ marginTop: 0 }}>Criar Nova Sala</h2>
            
            <input 
              type="text" 
              placeholder="Nome do Grupo/Sala"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }}
            />

            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Selecione os participantes:</p>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '0.5rem', marginBottom: '1rem', borderRadius: '4px' }}>
              {allUsers.filter(u => u.id !== myUserId).length === 0 ? (
                <p style={{ color: '#888', fontSize: '0.9rem' }}>Nenhum outro usuário encontrado no sistema.</p>
              ) : (
                allUsers.filter(u => u.id !== myUserId).map(u => (
                  <label key={u.id} style={{ display: 'block', padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleUserSelection(u.id)}
                      style={{ marginRight: '0.8rem' }}
                    />
                    {u.email}
                  </label>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: '0.8rem 1.5rem', border: 'none', background: '#ccc', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>Cancelar</button>
              <button onClick={handleCreateRoom} style={{ padding: '0.8rem 1.5rem', border: 'none', background: '#00a884', color: 'white', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>Criar Sala</button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{ width: '300px', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #ddd', background: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Conversas</h2>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>{user?.email}</span>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={{ background: '#00a884', color: 'white', border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Nova Sala"
          >
            +
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rooms.map(room => {
            const unreadCount = unreadCounts[room.id] || 0;
            return (
              <div 
                key={room.id} 
                onClick={() => joinRoom(room)}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: '1px solid #eee', 
                  cursor: 'pointer',
                  background: activeRoom?.id === room.id ? '#ebebeb' : '#fff',
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#00a884', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    {getInitials(room.name)}
                  </div>
                  <div>
                    <strong style={{ display: 'block', color: '#333' }}>{room.name}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{room.type === 'GROUP' ? 'Grupo' : 'Privado'}</span>
                  </div>
                </div>

                {unreadCount > 0 && (
                  <div style={{ background: '#25d366', color: '#white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    {unreadCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div style={{ padding: '1rem', borderTop: '1px solid #ddd' }}>
          <button 
            onClick={signOut} 
            style={{ width: '100%', padding: '0.8rem', background: '#ff4c4c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Sair da Conta
          </button>
        </div>
      </div>

      {/* ÁREA DO CHAT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#e5ddd5' }}>
        {!activeRoom ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', background: '#f0f2f5' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 1rem 0' }}>Chat Fullstack</h2>
              <p>Selecione uma conversa para começar a enviar mensagens.</p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '1rem 2rem', background: '#f0f2f5', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                {getInitials(activeRoom.name)}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#333' }}>{activeRoom.name}</h2>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {messages.map((msg, index) => {
                const isMe = msg.senderUsername === user?.email?.split('@')[0];
                return (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem', alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                    {!isMe && (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff', flexShrink: 0, marginTop: '4px' }}>
                        {getInitials(msg.senderUsername)}
                      </div>
                    )}
                    <div style={{ background: isMe ? '#dcf8c6' : '#fff', padding: '0.5rem 0.5rem 0.5rem 1rem', borderRadius: '8px', boxShadow: '0 1px 1px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                      {!isMe && (
                        <span style={{ fontSize: '0.75rem', color: '#00a884', fontWeight: 'bold', marginBottom: '2px' }}>
                          {msg.senderUsername}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                        <span style={{ fontSize: '0.95rem', lineHeight: '1.4', color: '#303030' }}>
                          {msg.content}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#888', whiteSpace: 'nowrap', marginBottom: '-2px' }}>
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* INDICADOR DE DIGITAÇÃO NA TELA */}
            {currentlyTyping.length > 0 && (
              <div style={{ padding: '0 2rem 0.5rem 2rem', fontSize: '0.8rem', color: '#666', fontStyle: 'italic', background: '#f0f2f5' }}>
                {currentlyTyping.join(', ')} {currentlyTyping.length > 1 ? 'estão digitando...' : 'está digitando...'}
              </div>
            )}

            <div style={{ padding: '1rem 2rem', background: '#f0f2f5', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input 
                type="text" 
                value={newMessage} 
                onChange={handleInputChange} // Usando a nova função com controle de digitação
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Digite uma mensagem" 
                style={{ flex: 1, padding: '1rem 1.5rem', borderRadius: '24px', border: '1px solid #ddd', outline: 'none', fontSize: '1rem' }}
              />
              <button 
                onClick={sendMessage}
                style={{ padding: '0 2rem', height: '50px', background: '#00a884', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}