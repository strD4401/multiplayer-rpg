import io from "socket.io-client";

// Create a singleton socket instance
export const gameSocket = io("http://localhost:3000");

// Add a helper to update player name
export const updatePlayerName = (name: string) => {
  if (name.trim()) {
    gameSocket.emit("setName", name);
    return true;
  }
  return false;
}; 