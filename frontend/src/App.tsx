import { useEffect } from "react";
import Phaser from "phaser";

import { gameConfig } from "./game/config";

function App() {
    useEffect(() => {
        const game = new Phaser.Game(gameConfig);

        return () => {
            game.destroy(true);
        };
    }, []);

    return <div id="game-container"></div>;
}

export default App;