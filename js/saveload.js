// Save and Load system
class SaveLoadManager {
    constructor() {
        this.saves = this.loadAllSaves();
    }

    loadAllSaves() {
        const saves = [];
        for (let i = 0; i < CONFIG.MAX_SAVE_SLOTS; i++) {
            const key = `save_slot_${i}`;
            const data = localStorage.getItem(key);
            if (data) {
                try {
                    saves[i] = JSON.parse(data);
                } catch (e) {
                    saves[i] = null;
                }
            } else {
                saves[i] = null;
            }
        }
        return saves;
    }

    saveGame(slot, gameState) {
        const key = `save_slot_${slot}`;
        const saveData = {
            timestamp: Date.now(),
            money: gameState.money,
            wood: gameState.warehouse.wood,
            warehouseCapacity: gameState.warehouse.capacity,
            warehouseLevel: gameState.warehouse.level,
            shopUpgrades: gameState.shop.upgrades,
            playerX: gameState.player.x,
            playerY: gameState.player.y,
            season: gameState.season.currentSeasonIndex,
            seasonTimer: gameState.season.seasonTimer,
            trees: gameState.world.trees.map(tree => ({
                x: tree.x,
                y: tree.y,
                chopCount: tree.chopCount,
                isChopped: tree.isChopped,
                respawnTimer: tree.respawnTimer,
            })),
            npcs: gameState.npcs.map(npc => ({
                x: npc.x,
                y: npc.y,
                type: npc.type,
                axeLevel: npc.axeLevel,
            })),
        };

        localStorage.setItem(key, JSON.stringify(saveData));
        this.saves[slot] = saveData;
        return true;
    }

    loadGame(slot) {
        const save = this.saves[slot];
        if (!save) return null;
        return save;
    }

    deleteSave(slot) {
        const key = `save_slot_${slot}`;
        localStorage.removeItem(key);
        this.saves[slot] = null;
    }

    hasSave(slot) {
        return this.saves[slot] !== null;
    }

    getSaves() {
        return this.saves;
    }
}
