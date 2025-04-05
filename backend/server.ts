import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

interface PlayerData {
  x: number;
  y: number;
  name?: string;
  playerIndex?: number;
}

interface ChatInvitation {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  timestamp: number;
}

const players: Record<string, PlayerData> = {};
const CHAT_PROXIMITY = 100; // Chat proximity distance in pixels
const chatGroups: Record<string, string[]> = {}; // Map group ID to members
const playerGroups: Record<string, string> = {}; // Map player ID to their group
const pendingInvitations: Record<string, ChatInvitation> = {}; // Store pending invitations

// Helper to calculate distance
function getDistance(a: PlayerData, b: PlayerData) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Get all nearby players given a player ID
function getNearbyPlayers(playerId: string): string[] {
  const player = players[playerId];
  if (!player) return [];
  
  const nearby: string[] = [];
  
  for (const [id, otherPlayer] of Object.entries(players)) {
    if (id === playerId) continue;
    const distance = getDistance(player, otherPlayer);
    if (distance <= CHAT_PROXIMITY) {
      nearby.push(id);
    }
  }
  
  return nearby;
}

// Create a new chat group with initial members
function createChatGroup(creatorId: string, members: string[] = []): string {
  const groupId = `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const allMembers = [creatorId, ...members.filter(id => id !== creatorId)];
  
  chatGroups[groupId] = allMembers;
  
  // Set the group for each member
  allMembers.forEach(memberId => {
    playerGroups[memberId] = groupId;
  });
  
  return groupId;
}

// Add a player to a chat group
function addToGroup(groupId: string, playerId: string): boolean {
  if (!chatGroups[groupId]) return false;
  
  // If already in group, do nothing
  if (chatGroups[groupId].includes(playerId)) return true;
  
  // Add to group
  chatGroups[groupId].push(playerId);
  playerGroups[playerId] = groupId;
  
  return true;
}

// Remove a player from their current group
function leaveGroup(playerId: string): boolean {
  const groupId = playerGroups[playerId];
  if (!groupId || !chatGroups[groupId]) return false;
  
  // Remove from the group
  chatGroups[groupId] = chatGroups[groupId].filter(id => id !== playerId);
  delete playerGroups[playerId];
  
  // If group is empty, delete it
  if (chatGroups[groupId].length === 0) {
    delete chatGroups[groupId];
  }
  
  return true;
}

io.on("connection", (socket) => {
  console.log(`🟢 ${socket.id} connected`);

  // Set player name
  socket.on("setName", (name: string) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      io.emit("updatePlayers", players);
    }
  });

  // Wait for the client to send initial position
  socket.on("join", (data: PlayerData) => {
    // Assign random player index (0-3) for character variety
    const playerIndex = Math.floor(Math.random() * 4);
    players[socket.id] = {
      ...data,
      playerIndex
    };
    io.emit("updatePlayers", players);
  });

  // Handle movement
  socket.on("move", (data: PlayerData) => {
    if (players[socket.id]) {
      // Update position while preserving other properties
      players[socket.id] = {
        ...players[socket.id],
        x: data.x,
        y: data.y
      };
      
      // If name was provided, update it
      if (data.name && players[socket.id].name !== data.name) {
        players[socket.id].name = data.name;
      }
      
      io.emit("updatePlayers", players);
    }
  });

  // Handle proximity chat
  socket.on("message", (msg: string) => {
    const senderPos = players[socket.id];
    if (!senderPos) return;
    
    // Create the message object with sender information
    const messageObj = {
      from: socket.id,
      text: msg,
    };
    
    // Check if player is in a group
    const groupId = playerGroups[socket.id];
    
    if (groupId && chatGroups[groupId]) {
      // Send to all group members
      chatGroups[groupId].forEach(memberId => {
        io.to(memberId).emit("message", messageObj);
      });
    } else {
      // Get all players within proximity
      const nearbyPlayers = getNearbyPlayers(socket.id);
      
      // Send to the sender
      socket.emit("message", messageObj);
      
      // Send to all nearby players
      nearbyPlayers.forEach(playerId => {
        io.to(playerId).emit("message", messageObj);
      });
    }
  });
  
  // Send chat invitation
  socket.on("inviteToChat", (targetId: string) => {
    const fromPlayer = players[socket.id];
    const toPlayer = players[targetId];
    
    if (!fromPlayer || !toPlayer) return;
    
    // Only allow inviting nearby players
    const nearbyPlayers = getNearbyPlayers(socket.id);
    if (!nearbyPlayers.includes(targetId)) {
      socket.emit("chatError", "Player is not nearby");
      return;
    }
    
    // Create invitation
    const invitation: ChatInvitation = {
      from: socket.id,
      to: targetId,
      fromName: fromPlayer.name || `Player ${socket.id.substring(0, 4)}`,
      toName: toPlayer.name || `Player ${targetId.substring(0, 4)}`,
      timestamp: Date.now()
    };
    
    // Store invitation
    const inviteId = `${socket.id}_${targetId}_${Date.now()}`;
    pendingInvitations[inviteId] = invitation;
    
    // Send invitation to target player
    io.to(targetId).emit("chatInvitation", {
      inviteId,
      from: socket.id,
      fromName: invitation.fromName
    });
    
    // Send confirmation to sender
    socket.emit("invitationSent", {
      inviteId,
      to: targetId,
      toName: invitation.toName
    });
  });
  
  // Accept chat invitation
  socket.on("acceptInvitation", (inviteId: string) => {
    const invitation = pendingInvitations[inviteId];
    if (!invitation || invitation.to !== socket.id) {
      socket.emit("chatError", "Invalid invitation");
      return;
    }
    
    const senderGroup = playerGroups[invitation.from];
    
    if (senderGroup) {
      // Add player to existing group
      if (addToGroup(senderGroup, socket.id)) {
        // Notify all group members
        chatGroups[senderGroup].forEach(memberId => {
          io.to(memberId).emit("playerJoinedGroup", {
            groupId: senderGroup,
            playerId: socket.id,
            playerName: players[socket.id]?.name || `Player ${socket.id.substring(0, 4)}`,
            members: chatGroups[senderGroup]
          });
        });
      }
    } else {
      // Create a new group with both players
      const groupId = createChatGroup(invitation.from, [socket.id]);
      
      // Notify both players
      [invitation.from, socket.id].forEach(memberId => {
        io.to(memberId).emit("groupCreated", {
          groupId,
          members: chatGroups[groupId],
          memberNames: chatGroups[groupId].map(id => 
            players[id]?.name || `Player ${id.substring(0, 4)}`)
        });
      });
    }
    
    // Remove the invitation
    delete pendingInvitations[inviteId];
  });
  
  // Reject chat invitation
  socket.on("rejectInvitation", (inviteId: string) => {
    const invitation = pendingInvitations[inviteId];
    if (!invitation || invitation.to !== socket.id) {
      return;
    }
    
    // Notify sender of rejection
    io.to(invitation.from).emit("invitationRejected", {
      inviteId,
      by: socket.id,
      byName: players[socket.id]?.name || `Player ${socket.id.substring(0, 4)}`
    });
    
    // Remove the invitation
    delete pendingInvitations[inviteId];
  });
  
  // Leave chat group
  socket.on("leaveGroup", () => {
    if (leaveGroup(socket.id)) {
      socket.emit("leftGroup");
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`🔴 ${socket.id} disconnected`);
    
    // Leave any chat groups
    leaveGroup(socket.id);
    
    // Remove player
    delete players[socket.id];
    io.emit("updatePlayers", players);
    
    // Clean up pending invitations
    Object.keys(pendingInvitations).forEach(inviteId => {
      const invite = pendingInvitations[inviteId];
      if (invite.from === socket.id || invite.to === socket.id) {
        delete pendingInvitations[inviteId];
      }
    });
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://0.0.0.0:3000");
});
