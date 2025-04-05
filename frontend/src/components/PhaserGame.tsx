import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import GameScene from "./GameScene";
import PreloadScene from "./PreloadScene";
import GameOverlay from "./GameOverlay";

const PhaserGame = () => {
  const gameRef = useRef<HTMLDivElement>(null);
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameRef.current,
      backgroundColor: "#333333",
      physics: {
        default: "arcade",
        arcade: { 
          debug: false,
          gravity: { x: 0, y: 0 } // No gravity for top-down game
        },
      },
      scene: [PreloadScene, GameScene],
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 800,
        height: 600,
        min: {
          width: 320,
          height: 240
        },
        max: {
          width: 1600,
          height: 1200
        }
      }
    };

    const game = new Phaser.Game(config);
    setGameInstance(game);
    
    return () => {
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    const preventScroll = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", preventScroll, { passive: false });
    return () => window.removeEventListener("keydown", preventScroll);
  }, []);

  const handleMove = (dx: number, dy: number) => {
    if (!gameInstance) return;
    
    // Get the GameScene instance
    const gameScene = gameInstance.scene.getScene('GameScene') as GameScene;
    if (gameScene && gameScene.movePlayer) {
      gameScene.movePlayer(dx, dy);
    }
  };
  
  return (
    <div className="game-container" style={{ 
      position: 'relative', 
      width: '100%', 
      height: '90vh', 
      margin: 0, 
      padding: 10,
      top: 5,
      bottom: 5,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden'
    }}>
      <div ref={gameRef} style={{ 
        width: '100%', 
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center' 
      }} />
      <GameOverlay onMove={handleMove} />
    </div>
  );
};

export default PhaserGame;
