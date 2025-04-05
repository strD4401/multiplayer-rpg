import { useEffect, useState, useCallback } from "react";
import "../styles/GameOverlay.css";
import { gameSocket, updatePlayerName } from "../services/socket";

interface GameOverlayProps {
  onMove: (dx: number, dy: number) => void;
}

interface Invitation {
  inviteId: string;
  from: string;
  fromName: string;
}

interface ChatGroup {
  groupId: string;
  members: string[];
  memberNames: string[];
}

const GameOverlay = ({ onMove }: GameOverlayProps) => {
  const [_players, setPlayers] = useState<{
    [key: string]: { x: number; y: number; name?: string };
  }>({});
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [chat, setChat] = useState<{ from: string; text: string }[]>([]);
  const [message, setMessage] = useState("");
  const [canChat, setCanChat] = useState(false);
  const [nearbyPlayers, setNearbyPlayers] = useState<string[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [sentInvitations, setSentInvitations] = useState<string[]>([]); 
  const [currentGroup, setCurrentGroup] = useState<ChatGroup | null>(null);
  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const [username, setUsername] = useState(`Player_${Math.floor(Math.random() * 1000)}`);
  const [editingUsername, setEditingUsername] = useState(false);
  
  // Memoize handlers to prevent unnecessary re-renders
  const sendMessage = useCallback(() => {
    if (message.trim() && (canChat || currentGroup)) {
      gameSocket.emit("message", message);
      setMessage("");
    }
  }, [message, canChat, currentGroup]);
  
  const sendInvitation = useCallback((targetId: string) => {
    gameSocket.emit("inviteToChat", targetId);
    setShowInviteMenu(false);
  }, []);
  
  const acceptInvitation = useCallback((inviteId: string) => {
    gameSocket.emit("acceptInvitation", inviteId);
    setPendingInvitations(prev => prev.filter(invite => invite.inviteId !== inviteId));
  }, []);
  
  const rejectInvitation = useCallback((inviteId: string) => {
    gameSocket.emit("rejectInvitation", inviteId);
    setPendingInvitations(prev => prev.filter(invite => invite.inviteId !== inviteId));
  }, []);
  
  const leaveGroup = useCallback(() => {
    if (currentGroup) {
      gameSocket.emit("leaveGroup");
    }
  }, [currentGroup]);
  
  const updateUsernameHandler = useCallback(() => {
    if (updatePlayerName(username)) {
      setEditingUsername(false);
    }
  }, [username]);
  
  // Get player name from player data - memoize for performance
  const getPlayerName = useCallback((id: string) => {
    if (!_players[id]) return `Player ${id.substring(0, 4)}`;
    return _players[id].name || `Player ${id.substring(0, 4)}`;
  }, [_players]);

  // Create the group chat label text
  const getGroupChatLabel = useCallback(() => {
    if (currentGroup) {
      return `Group Chat (${currentGroup.members.length} members)`;
    }
    
    if (nearbyPlayers.length === 0) return "";
    if (nearbyPlayers.length === 1) return `Chatting with ${getPlayerName(nearbyPlayers[0])}`;
    
    return `${nearbyPlayers.length} players nearby`;
  }, [currentGroup, nearbyPlayers, getPlayerName]);

  useEffect(() => {
    // Send initial name on connection
    const handleConnect = () => {
      setPlayerId(gameSocket.id ?? null);
      updatePlayerName(username);
    };

    // Process player updates
    const handleUpdatePlayers = (data: any) => {
      setPlayers(data);
      
      if (gameSocket.id) {
        const myPosition = data[gameSocket.id];
        if (myPosition) {
          const nearby: string[] = [];
          
          for (const [id, pos] of Object.entries(data)) {
            if (id === gameSocket.id) continue;
            const typedPos = pos as { x: number; y: number; name?: string };
            const dist = Math.sqrt(
              (myPosition.x - typedPos.x) ** 2 + (myPosition.y - typedPos.y) ** 2
            );
            
            if (dist <= 100) {
              nearby.push(id);
            }
          }
          
          setNearbyPlayers(nearby);
          setCanChat(nearby.length > 0 || currentGroup !== null);
        }
      }
    };

    // Set up all socket event listeners
    gameSocket.on("connect", handleConnect);
    gameSocket.on("updatePlayers", handleUpdatePlayers);
    gameSocket.on("message", (msg) => setChat(prev => [...prev, msg]));
    
    gameSocket.on("chatInvitation", (invitation: Invitation) => {
      setPendingInvitations(prev => [...prev, invitation]);
    });
    
    gameSocket.on("invitationSent", ({ inviteId }) => {
      setSentInvitations(prev => [...prev, inviteId]);
    });
    
    gameSocket.on("invitationRejected", ({ inviteId, byName }) => {
      setSentInvitations(prev => prev.filter(id => id !== inviteId));
      setChat(prev => [...prev, { 
        from: 'system', 
        text: `${byName} rejected your chat invitation.`
      }]);
    });
    
    gameSocket.on("groupCreated", (group: ChatGroup) => {
      setCurrentGroup(group);
      setChat(prev => [...prev, { 
        from: 'system', 
        text: `You are now in a group chat with ${group.memberNames.filter(name => 
          !name.includes(playerId || '')).join(', ')}`
      }]);
    });
    
    gameSocket.on("playerJoinedGroup", ({ groupId, playerName, members }) => {
      if (currentGroup && currentGroup.groupId === groupId) {
        setCurrentGroup(prev => prev ? {
          ...prev,
          members,
          memberNames: [...prev.memberNames, playerName]
        } : null);
        
        setChat(prev => [...prev, { 
          from: 'system', 
          text: `${playerName} joined the group chat.`
        }]);
      }
    });
    
    gameSocket.on("leftGroup", () => {
      setCurrentGroup(null);
      setChat(prev => [...prev, { 
        from: 'system', 
        text: 'You left the group chat.'
      }]);
    });
    
    gameSocket.on("chatError", (errorMessage: string) => {
      setChat(prev => [...prev, { 
        from: 'system', 
        text: `Error: ${errorMessage}`
      }]);
    });

    // Clean up all event listeners
    return () => {
      gameSocket.off("connect", handleConnect);
      gameSocket.off("updatePlayers", handleUpdatePlayers);
      gameSocket.off("message");
      gameSocket.off("chatInvitation");
      gameSocket.off("invitationSent");
      gameSocket.off("invitationRejected");
      gameSocket.off("groupCreated");
      gameSocket.off("playerJoinedGroup");
      gameSocket.off("leftGroup");
      gameSocket.off("chatError");
    };
  }, [playerId, currentGroup, username]);

  return (
    <div className="game-overlay">
      {/* Username edit field */}
      <div className="username-container">
        {editingUsername ? (
          <div className="username-edit">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={15}
              placeholder="Enter username"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateUsernameHandler();
                }
              }}
              autoFocus
            />
            <button onClick={updateUsernameHandler}>Save</button>
          </div>
        ) : (
          <div className="username-display">
            <span>Username: {username}</span>
            <button onClick={() => setEditingUsername(true)}>Edit</button>
          </div>
        )}
      </div>

      {/* Manual controls */}
      <div className="controls">
        <button onClick={() => onMove(0, -5)}>⬆️</button>
        <div>
          <button onClick={() => onMove(-5, 0)}>⬅️</button>
          <button onClick={() => onMove(5, 0)}>➡️</button>
        </div>
        <button onClick={() => onMove(0, 5)}>⬇️</button>
      </div>

      {/* Chat UI */}
      <div className="chat-container">
        {pendingInvitations.length > 0 && (
          <div className="invitations-container">
            {pendingInvitations.map(invite => (
              <div key={invite.inviteId} className="invitation">
                <span>{invite.fromName} invited you to chat</span>
                <div className="invitation-actions">
                  <button 
                    className="accept-btn"
                    onClick={() => acceptInvitation(invite.inviteId)}
                  >
                    Accept
                  </button>
                  <button 
                    className="reject-btn"
                    onClick={() => rejectInvitation(invite.inviteId)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Chat header with group info */}
        <div className="chat-header">
          <div className="group-chat-label">
            {getGroupChatLabel()}
          </div>
          
          <div className="chat-actions">
            {currentGroup ? (
              <button 
                className="leave-group-btn" 
                onClick={leaveGroup}
                title="Leave group chat"
              >
                Leave
              </button>
            ) : (
              nearbyPlayers.length > 0 && (
                <button 
                  className="invite-btn" 
                  onClick={() => setShowInviteMenu(!showInviteMenu)}
                  title="Invite to chat"
                >
                  Invite
                </button>
              )
            )}
          </div>
        </div>
        
        {/* Invite players dropdown */}
        {showInviteMenu && (
          <div className="invite-menu">
            <div className="invite-header">Select player to invite:</div>
            {nearbyPlayers.map(id => (
              <button
                key={id}
                className="player-invite-btn"
                onClick={() => sendInvitation(id)}
                disabled={sentInvitations.includes(`${playerId}_${id}_${Date.now()}`)}
              >
                {getPlayerName(id)}
              </button>
            ))}
          </div>
        )}
        
        {/* Members in group display */}
        {currentGroup && currentGroup.members.length > 1 && (
          <div className="players-in-chat">
            {currentGroup.members
              .filter(id => id !== playerId)
              .map((id, index) => (
                <div key={id} className="player-badge">
                  {index < currentGroup.memberNames.length
                    ? currentGroup.memberNames[index] 
                    : getPlayerName(id)}
                </div>
              ))}
          </div>
        )}
        
        {/* Chat messages */}
        <div className="chat-messages">
          {chat.map((c, i) => {
            if (c.from === 'system') {
              return (
                <div key={i} className="system-message">
                  {c.text}
                </div>
              );
            }
            
            return (
              <div key={i} className={c.from === playerId ? "my-message" : "other-message"}>
                <strong>{c.from === playerId ? "You" : getPlayerName(c.from)}</strong>: {c.text}
              </div>
            );
          })}
        </div>
        
        {/* Chat input */}
        <div className="chat-input">
          <input
            type="text"
            value={message}
            disabled={!canChat && !currentGroup}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={canChat || currentGroup ? "Say something..." : "Get closer to players to chat"}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (canChat || currentGroup)) {
                sendMessage();
              }
            }}
          />
          <button onClick={sendMessage} disabled={!canChat && !currentGroup}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameOverlay;