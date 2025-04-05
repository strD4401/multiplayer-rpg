import Phaser from "phaser";
import { gameSocket } from "../services/socket";

interface PlayerData {
  x: number;
  y: number;
  playerIndex?: number;
  name?: string;
}

export default class GameScene extends Phaser.Scene {
  player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  players: Record<string, Phaser.Types.Physics.Arcade.SpriteWithDynamicBody> = {};
  playerNames: Record<string, Phaser.GameObjects.Text> = {};
  playerData: Record<string, PlayerData> = {};
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  playerName: string = "";
  // Add debounce mechanism for move events
  lastMoveUpdate: number = 0;
  moveUpdateInterval: number = 50; // ms between position updates
  movePending: boolean = false;
  
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Create the tilemap
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("tiles", "tiles");
    
    if (!tileset) {
      console.error("Failed to load tileset");
      return;
    }
    
    // Create layers - the groundLayer needs to be stored for collision
    this.groundLayer = map.createLayer("Ground", tileset, 0, 0)!;
    map.createLayer("Decoration", tileset, 0, 0); // Add the decoration layer from your map
    
    // Set collision for border tiles and any tile with the collides property
    this.groundLayer.setCollisionByProperty({ collides: true });
    // Also set collision for tile index 1 (usually the border tiles)
    this.groundLayer.setCollisionBetween(1, 1);
    
    // Create player sprite using physics - using the first player from the spritesheet
    this.player = this.physics.add.sprite(400, 300, "players", 0);
    this.player.setCollideWorldBounds(true);

    // Get the player's name from the server when it's set
    gameSocket.on("updatePlayers", (data) => {
      if (gameSocket.id && data[gameSocket.id] && data[gameSocket.id].name) {
        const newName = data[gameSocket.id].name || "";
        
        // Only update if name changed
        if (this.playerName !== newName) {
          this.playerName = newName;
          
          // Update the name text if it exists
          if (this.playerNames[gameSocket.id]) {
            this.playerNames[gameSocket.id].setText(this.playerName);
            // Center the text again after changing it
            this.playerNames[gameSocket.id].setOrigin(0.5, 0.5);
          }
        }
      }
    });

    // Create player name text if we have a socket ID
    if (gameSocket && gameSocket.id) {
      this.createPlayerNameText(gameSocket.id, this.player, this.playerName || "Player");
    }
    
    // Add collision between player and ground layer
    this.physics.add.collider(this.player, this.groundLayer);
    
    // Initialize the local player in the players dictionary
    if (gameSocket && gameSocket.id) {
      this.players[gameSocket.id] = this.player;
      this.playerData[gameSocket.id] = { 
        x: this.player.x, 
        y: this.player.y,
        name: this.playerName 
      };
      
      // Emit the initial position to the server
      gameSocket.emit("join", { 
        x: this.player.x, 
        y: this.player.y,
        name: this.playerName
      });
    } else {
      console.warn("Socket connection not established, playing in offline mode");
    }
    
    // Setup socket event handlers if socket exists
    if (gameSocket) {
      gameSocket.on("connect", () => {
        console.log("Connected to socket server");
        if (gameSocket && gameSocket.id) {
          this.players[gameSocket.id] = this.player;
          this.playerData[gameSocket.id] = { 
            x: this.player.x, 
            y: this.player.y,
            name: this.playerName
          };
          gameSocket.emit("join", { 
            x: this.player.x, 
            y: this.player.y,
            name: this.playerName 
          });
        }
      });
      
      gameSocket.on("updatePlayers", (data: Record<string, PlayerData>) => {
        // Store the player data
        this.playerData = data;
        
        // Handle player updates from the server
        Object.keys(data).forEach(id => {
          // Skip the local player because we handle their movement locally
          if (id === gameSocket.id) return;
          
          const playerInfo = data[id];
          const playerIndex = playerInfo.playerIndex || 1; // Default to blue player (index 1) if not specified
          
          if (!this.players[id]) {
            // Create new player sprite for this remote player
            const newPlayer = this.physics.add.sprite(playerInfo.x, playerInfo.y, "players", playerIndex);
            this.players[id] = newPlayer;
            this.physics.add.collider(newPlayer, this.groundLayer);
            
            // Create name text for the new player
            this.createPlayerNameText(id, newPlayer, playerInfo.name || `Player_${id.substring(0, 4)}`);
          } else {
            // Update existing player positions
            this.players[id].setPosition(playerInfo.x, playerInfo.y);
            
            // Update name position and text if needed
            if (this.playerNames[id]) {
              this.playerNames[id].setPosition(
                playerInfo.x - this.playerNames[id].width / 2, 
                playerInfo.y - 40
              );
              
              // Update name text if it changed
              if (playerInfo.name && this.playerNames[id].text !== playerInfo.name) {
                this.playerNames[id].setText(playerInfo.name);
                this.playerNames[id].setOrigin(0.5, 0.5);
              }
            }
          }
        });
        
        // Remove players who have disconnected
        Object.keys(this.players).forEach(id => {
          if (id !== gameSocket.id && !data[id]) {
            this.players[id].destroy();
            delete this.players[id];
            
            // Clean up name text
            if (this.playerNames[id]) {
              this.playerNames[id].destroy();
              delete this.playerNames[id];
            }
          }
        });
      });
    }
    
    // Set up keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();
  }
  
  update(time: number) {
    if (!this.player) return;
    
    // Reset player velocity
    this.player.setVelocity(0);
    
    const speed = 150;
    
    // Handle keyboard movement
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
    }
    
    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-speed);
    } else if (this.cursors.down.isDown) {
      this.player.setVelocityY(speed);
    }
    
    // Update player name position
    if (gameSocket.id && this.playerNames[gameSocket.id]) {
      this.playerNames[gameSocket.id].setPosition(
        this.player.x,
        this.player.y - 40
      );
    }
    
    // Emit position to server if connected and time interval passed
    if (gameSocket && gameSocket.connected && gameSocket.id) {
      // Check if it's time to send a position update
      if (time - this.lastMoveUpdate >= this.moveUpdateInterval) {
        if (this.movePending || 
            (this.playerData[gameSocket.id] && 
             (Math.abs(this.playerData[gameSocket.id].x - this.player.x) > 1 || 
              Math.abs(this.playerData[gameSocket.id].y - this.player.y) > 1))) {
            
          gameSocket.emit("move", { 
            x: this.player.x, 
            y: this.player.y,
            name: this.playerName
          });
          
          // Update last move time and reset pending flag
          this.lastMoveUpdate = time;
          this.movePending = false;
          
          // Update local cache
          this.playerData[gameSocket.id] = {
            ...this.playerData[gameSocket.id] || {},
            x: this.player.x,
            y: this.player.y
          };
        }
      }
    }
  }

  // Add a method to move the player from external controls
  movePlayer(dx: number, dy: number) {
    if (!this.player) return;
    
    // Use physics velocity instead of directly changing position
    // This ensures collision detection works properly
    const speed = 150;
    
    if (dx > 0) {
      this.player.setVelocityX(speed);
    } else if (dx < 0) {
      this.player.setVelocityX(-speed);
    } else {
      this.player.setVelocityX(0);
    }
    
    if (dy > 0) {
      this.player.setVelocityY(speed);
    } else if (dy < 0) {
      this.player.setVelocityY(-speed);
    } else {
      this.player.setVelocityY(0);
    }
    
    // Mark that we need to send an update
    this.movePending = true;
  }

  // Create a text object for player names
  createPlayerNameText(id: string, playerSprite: Phaser.GameObjects.Sprite, name: string) {
    // Create and style the text
    const nameText = this.add.text(
      playerSprite.x, 
      playerSprite.y - 40, 
      name, 
      {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center'
      }
    );
    
    // Center the text
    nameText.setOrigin(0.5, 0.5);
    
    // Store the text reference
    this.playerNames[id] = nameText;
  }
}