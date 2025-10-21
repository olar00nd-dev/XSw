// Game configuration
const CONFIG = {
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 600,
    
    // Debug settings
    DEBUG_ENABLED: true,
    DEBUG_CONSOLE_ENABLED: true,
    
    // Game settings
    TREE_CHOP_CLICKS: 30,
    WORLD_WIDTH: 3000,
    WORLD_MIN_X: 0,
    
    // Player settings
    PLAYER_SPEED: 3,
    PLAYER_WIDTH: 32,
    PLAYER_HEIGHT: 48,
    PLAYER_START_X: 100,
    PLAYER_START_Y: 400,
    
    // Tree settings
    TREE_WIDTH: 64,
    TREE_HEIGHT: 96,
    TREE_RESPAWN_TIME: 30000, // 30 seconds
    WOOD_PER_TREE: 1,
    
    // Economy
    WOOD_BASE_PRICE: 10,
    STARTING_MONEY: 0,
    
    // Shop upgrades
    UPGRADES: {
        WORKER_COST: 100,
        WORKER_AXE_UPGRADE_COST: 50,
        WAREHOUSE_UPGRADE_COST: 150,
        CASHIER_COST: 80,
    },
    
    // Warehouse
    WAREHOUSE_BASE_CAPACITY: 10,
    WAREHOUSE_UPGRADE_INCREASE: 5,
    
    // NPC Workers
    NPC_CHOP_TIME: 2000, // 2 seconds with upgraded axe
    
    // Seasons
    SEASON_DURATION: 120000, // 2 minutes per season
    
    // Save slots
    MAX_SAVE_SLOTS: 4,
    
    // Localization
    DEFAULT_LOCALE: 'en',
};
