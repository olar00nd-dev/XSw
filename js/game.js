// Main Game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;

        this.state = 'mainMenu'; // mainMenu, playing, paused, saveSlots, settings
        this.input = new InputManager();
        this.ui = new UI();
        this.saveManager = new SaveLoadManager();
        this.debugConsole = new DebugConsole();

        // Menu state
        this.menuSelection = 0;
        this.maxMenuOptions = 3;
        this.selectedSaveSlot = 0;

        // Game state (initialized in newGame or loadGame)
        this.player = null;
        this.world = null;
        this.camera = null;
        this.season = null;
        this.shop = null;
        this.warehouse = null;
        this.npcs = [];
        this.money = 0;
        this.godMode = false;

        // Customer system
        this.customers = [];
        this.customerSpawnTimer = 0;
        this.customerSpawnInterval = 10000; // 10 seconds

        // Key press tracking
        this.prevKeys = {};

        this.lastTime = performance.now();
        this.gameLoop();
    }

    newGame() {
        this.player = new Player(CONFIG.PLAYER_START_X, CONFIG.PLAYER_START_Y);
        this.world = new World();
        this.camera = new Camera();
        this.season = new SeasonManager();
        this.shop = new Shop();
        this.warehouse = new Warehouse();
        this.npcs = [];
        this.money = CONFIG.STARTING_MONEY;
        this.godMode = false;

        this.state = 'playing';
    }

    loadGameFromSlot(slot) {
        const saveData = this.saveManager.loadGame(slot);
        if (!saveData) return false;

        // Initialize base objects
        this.player = new Player(saveData.playerX, saveData.playerY);
        this.world = new World();
        this.camera = new Camera();
        this.season = new SeasonManager();
        this.shop = new Shop();
        this.warehouse = new Warehouse();
        this.npcs = [];

        // Restore state
        this.money = saveData.money;
        this.warehouse.wood = saveData.wood;
        this.warehouse.capacity = saveData.warehouseCapacity;
        this.warehouse.level = saveData.warehouseLevel;
        this.shop.upgrades = saveData.shopUpgrades;
        this.season.currentSeasonIndex = saveData.season;
        this.season.seasonTimer = saveData.seasonTimer;

        // Restore trees
        for (let i = 0; i < this.world.trees.length && i < saveData.trees.length; i++) {
            const treeData = saveData.trees[i];
            this.world.trees[i].chopCount = treeData.chopCount;
            this.world.trees[i].isChopped = treeData.isChopped;
            this.world.trees[i].respawnTimer = treeData.respawnTimer;
        }

        // Restore NPCs
        for (const npcData of saveData.npcs) {
            const npc = new NPC(npcData.x, npcData.y, npcData.type);
            npc.axeLevel = npcData.axeLevel;
            this.npcs.push(npc);
        }

        this.state = 'playing';
        return true;
    }

    saveGameToSlot(slot) {
        return this.saveManager.saveGame(slot, this);
    }

    update(deltaTime) {
        // Check for debug console toggle
        if (this.wasKeyPressed('`') || this.wasKeyPressed('~')) {
            this.debugConsole.toggle();
        }

        if (this.debugConsole.isOpen) {
            return; // Don't update game when console is open
        }

        switch (this.state) {
            case 'mainMenu':
                this.updateMainMenu();
                break;
            case 'playing':
                this.updatePlaying(deltaTime);
                break;
            case 'paused':
                this.updatePauseMenu();
                break;
            case 'saveSlots':
                this.updateSaveSlots();
                break;
            case 'settings':
                this.updateSettings();
                break;
        }
    }

    updateMainMenu() {
        if (this.wasKeyPressed('ArrowUp')) {
            this.menuSelection = (this.menuSelection - 1 + this.maxMenuOptions) % this.maxMenuOptions;
        } else if (this.wasKeyPressed('ArrowDown')) {
            this.menuSelection = (this.menuSelection + 1) % this.maxMenuOptions;
        } else if (this.wasKeyPressed('Enter')) {
            switch (this.menuSelection) {
                case 0: // New Game
                    this.newGame();
                    break;
                case 1: // Load Game
                    this.state = 'saveSlots';
                    this.selectedSaveSlot = 0;
                    break;
                case 2: // Settings
                    this.state = 'settings';
                    this.menuSelection = 0;
                    this.maxMenuOptions = 2;
                    break;
            }
        }
    }

    updatePauseMenu() {
        const pauseOptions = 4;
        
        if (this.wasKeyPressed('ArrowUp')) {
            this.menuSelection = (this.menuSelection - 1 + pauseOptions) % pauseOptions;
        } else if (this.wasKeyPressed('ArrowDown')) {
            this.menuSelection = (this.menuSelection + 1) % pauseOptions;
        } else if (this.wasKeyPressed('Enter')) {
            switch (this.menuSelection) {
                case 0: // Resume
                    this.state = 'playing';
                    break;
                case 1: // Save
                    this.state = 'saveSlots';
                    this.selectedSaveSlot = 0;
                    break;
                case 2: // Settings
                    this.state = 'settings';
                    break;
                case 3: // Main Menu
                    this.state = 'mainMenu';
                    this.menuSelection = 0;
                    this.maxMenuOptions = 3;
                    break;
            }
        } else if (this.wasKeyPressed('Escape')) {
            this.state = 'playing';
        }
    }

    updateSaveSlots() {
        if (this.wasKeyPressed('ArrowUp')) {
            this.selectedSaveSlot = (this.selectedSaveSlot - 1 + CONFIG.MAX_SAVE_SLOTS) % CONFIG.MAX_SAVE_SLOTS;
        } else if (this.wasKeyPressed('ArrowDown')) {
            this.selectedSaveSlot = (this.selectedSaveSlot + 1) % CONFIG.MAX_SAVE_SLOTS;
        } else if (this.wasKeyPressed('Enter')) {
            if (this.state === 'saveSlots') {
                // Try to load or save depending on context
                if (this.player) {
                    // We're in-game, save to this slot
                    this.saveGameToSlot(this.selectedSaveSlot);
                    this.ui.showMessage('Game saved!');
                    this.state = 'playing';
                } else {
                    // We're from main menu, try to load
                    if (this.loadGameFromSlot(this.selectedSaveSlot)) {
                        this.ui.showMessage('Game loaded!');
                    }
                }
            }
        } else if (this.wasKeyPressed('Escape')) {
            if (this.player) {
                this.state = 'paused';
            } else {
                this.state = 'mainMenu';
            }
        }
    }

    updateSettings() {
        const settingsOptions = 2;
        
        if (this.wasKeyPressed('ArrowUp')) {
            this.menuSelection = (this.menuSelection - 1 + settingsOptions) % settingsOptions;
        } else if (this.wasKeyPressed('ArrowDown')) {
            this.menuSelection = (this.menuSelection + 1) % settingsOptions;
        } else if (this.wasKeyPressed('Enter')) {
            if (this.menuSelection === 0) {
                // Toggle language
                i18n.setLocale(i18n.currentLocale === 'en' ? 'ru' : 'en');
                this.ui.showMessage('Language changed');
            } else if (this.menuSelection === 1) {
                // Back
                if (this.player) {
                    this.state = 'paused';
                } else {
                    this.state = 'mainMenu';
                    this.maxMenuOptions = 3;
                }
            }
        } else if (this.wasKeyPressed('Escape')) {
            if (this.player) {
                this.state = 'paused';
            } else {
                this.state = 'mainMenu';
                this.maxMenuOptions = 3;
            }
        }
    }

    updatePlaying(deltaTime) {
        // Pause menu toggle
        if (this.wasKeyPressed('Escape')) {
            this.state = 'paused';
            this.menuSelection = 0;
            return;
        }

        // Shop toggle
        if (this.wasKeyPressed('e')) {
            const dist = Math.abs(this.player.x - this.shop.x);
            if (dist < 150) {
                this.shop.toggle();
            }
        }

        // Shop menu interactions
        if (this.shop.isOpen) {
            this.handleShopInput();
            return; // Don't update game when shop is open
        }

        // Update player
        this.player.update(this.input, this.world);

        // Tree chopping
        if (this.input.isKeyDown(' ') || this.input.isKeyDown('Space')) {
            const tree = this.player.interact(this.world.trees);
            if (tree) {
                this.player.isChopping = true;
                this.player.choppingTree = tree;
                
                // Chop on click/space press (not hold)
                if (this.wasKeyPressed(' ') || this.wasKeyPressed('Space')) {
                    const chopped = tree.chop();
                    if (chopped) {
                        const added = this.warehouse.addWood(CONFIG.WOOD_PER_TREE);
                        if (added > 0) {
                            this.ui.showMessage(i18n.t('MESSAGES.TREE_CHOPPED'));
                        } else {
                            this.ui.showMessage(i18n.t('MESSAGES.WAREHOUSE_FULL'));
                        }
                        this.player.isChopping = false;
                        this.player.choppingTree = null;
                    }
                }
            }
        } else {
            this.player.isChopping = false;
            this.player.choppingTree = null;
        }

        // Update world
        this.world.update(deltaTime);

        // Update season
        this.season.update(deltaTime);

        // Update NPCs
        for (const npc of this.npcs) {
            npc.update(deltaTime, this.world.trees, this.warehouse);
        }

        // Update camera
        this.camera.follow(this.player);

        // Update UI
        this.ui.update(deltaTime);

        // Sell wood automatically (customers)
        this.updateCustomers(deltaTime);
    }

    updateCustomers(deltaTime) {
        // Simple customer system - auto-sell wood over time
        this.customerSpawnTimer += deltaTime;
        
        if (this.customerSpawnTimer >= this.customerSpawnInterval) {
            this.customerSpawnTimer = 0;
            
            // Sell wood if we have any and have cashiers
            const cashierCount = this.shop.upgrades.cashiers;
            const sellAmount = Math.min(this.warehouse.wood, 1 + cashierCount);
            
            if (sellAmount > 0) {
                const removed = this.warehouse.removeWood(sellAmount);
                const earnings = removed * CONFIG.WOOD_BASE_PRICE;
                this.money += earnings;
                
                if (removed > 0) {
                    this.ui.showMessage(`Sold ${removed} wood for $${earnings}`);
                }
            }
        }
    }

    handleShopInput() {
        if (this.wasKeyPressed('e') || this.wasKeyPressed('Escape')) {
            this.shop.toggle();
            return;
        }

        if (this.wasKeyPressed('1')) {
            if (this.shop.hireWorker(this)) {
                this.ui.showMessage(i18n.t('MESSAGES.WORKER_HIRED'));
            } else {
                this.ui.showMessage(i18n.t('MESSAGES.NOT_ENOUGH_MONEY'));
            }
        } else if (this.wasKeyPressed('2')) {
            if (this.shop.hireCashier(this)) {
                this.ui.showMessage(i18n.t('MESSAGES.WORKER_HIRED'));
            } else {
                this.ui.showMessage(i18n.t('MESSAGES.NOT_ENOUGH_MONEY'));
            }
        } else if (this.wasKeyPressed('3')) {
            if (this.shop.upgradeAxe(this)) {
                this.ui.showMessage(i18n.t('MESSAGES.UPGRADE_BOUGHT'));
            } else {
                this.ui.showMessage(i18n.t('MESSAGES.NOT_ENOUGH_MONEY'));
            }
        } else if (this.wasKeyPressed('4')) {
            if (this.shop.upgradeWarehouse(this)) {
                this.ui.showMessage(i18n.t('MESSAGES.UPGRADE_BOUGHT'));
            } else {
                this.ui.showMessage(i18n.t('MESSAGES.NOT_ENOUGH_MONEY'));
            }
        }
    }

    wasKeyPressed(key) {
        const isDown = this.input.isKeyDown(key);
        const wasDown = this.prevKeys[key] || false;
        const pressed = isDown && !wasDown;
        this.prevKeys[key] = isDown;
        return pressed;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.state) {
            case 'mainMenu':
                this.ui.drawMainMenu(this.ctx, this.menuSelection);
                break;
            case 'playing':
                this.drawPlaying();
                break;
            case 'paused':
                this.drawPlaying();
                this.ui.drawPauseMenu(this.ctx, this.menuSelection);
                break;
            case 'saveSlots':
                if (this.player) {
                    this.drawPlaying();
                }
                this.ui.drawSaveSlots(this.ctx, this.saveManager.getSaves(), this.selectedSaveSlot);
                break;
            case 'settings':
                if (this.player) {
                    this.drawPlaying();
                }
                this.drawSettings();
                break;
        }
    }

    drawPlaying() {
        // Draw world
        this.world.draw(this.ctx, this.camera, this.season);

        // Draw season particles
        this.season.drawParticles(this.ctx, this.camera);

        // Draw warehouse
        this.warehouse.draw(this.ctx, this.camera);

        // Draw shop
        this.shop.draw(this.ctx, this.camera);

        // Draw NPCs
        for (const npc of this.npcs) {
            npc.draw(this.ctx, this.camera);
        }

        // Draw player
        this.player.draw(this.ctx, this.camera);

        // Draw HUD
        this.ui.drawHUD(this.ctx, this);

        // Draw shop UI if open
        if (this.shop.isOpen) {
            this.shop.drawUI(this.ctx, this);
        }
    }

    drawSettings() {
        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Menu box
        const boxW = 400;
        const boxH = 300;
        const boxX = (CONFIG.CANVAS_WIDTH - boxW) / 2;
        const boxY = (CONFIG.CANVAS_HEIGHT - boxH) / 2;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(boxX, boxY, boxW, boxH);

        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Title
        Utils.drawText(this.ctx, i18n.t('SETTINGS.TITLE'), boxX + boxW / 2, boxY + 30, 32, '#FFD700', 'center');

        // Options
        const options = [
            `${i18n.t('SETTINGS.LANGUAGE')}: ${i18n.currentLocale.toUpperCase()}`,
            i18n.t('SETTINGS.BACK'),
        ];

        const startY = boxY + 100;
        const lineHeight = 50;

        for (let i = 0; i < options.length; i++) {
            const y = startY + i * lineHeight;
            const isSelected = i === this.menuSelection;
            const color = isSelected ? '#FFD700' : '#FFF';
            const size = isSelected ? 24 : 20;

            if (isSelected) {
                Utils.drawText(this.ctx, '>', boxX + 80, y, size, color);
            }

            Utils.drawText(this.ctx, options[i], boxX + boxW / 2, y, size, color, 'center');
        }
    }

    gameLoop() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();
        this.input.reset();

        requestAnimationFrame(() => this.gameLoop());
    }
}

// Make game accessible globally for debug console
window.Game = Game;
