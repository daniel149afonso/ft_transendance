import Phaser from "phaser";
import MainScene from "./scenes/MainScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,

    width: 800,
    height: 600,

    parent: "game-container",

    physics: {
        default: "arcade",
        arcade: {
            debug: false
        }
    },

    scene: [MainScene]
};