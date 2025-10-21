# WFLY WOOD MARKET

A 2D pixel-art side-scrolling wood market management game.

## Game Description

You are a lumberjack who chops trees and runs a wood market. Start by manually chopping trees (30 clicks per tree), waiting for customers, and gradually expand your business by hiring workers, upgrading equipment, and building a thriving wood market empire.

## Features

### Core Gameplay
- **Manual Wood Chopping**: Click/press spacebar 30 times to chop down a tree
- **Wood Market Management**: Sell wood to customers and earn money
- **Worker System**: Hire NPC lumberjacks to automatically chop trees
- **Cashier System**: Hire cashiers to serve customers more efficiently

### Upgrades
- **Hire Lumberjack Workers**: NPCs that automatically chop trees and bring wood to warehouse
- **Upgrade Axes**: Better tools for workers = faster chopping
- **Warehouse Upgrades**: Increase storage capacity
- **Hire Cashiers**: Automated customer service and sales

### World & Environment
- **Limited 2D World**: Side-scrolling gameplay with world boundaries
- **Season System**: Four seasons (Winter, Spring, Summer, Fall) with visual effects
- **Dynamic Weather**: Snow in winter, falling leaves in autumn

### Game Systems
- **4 Save Slots**: Multiple save files for different playthroughs
- **Main Menu**: Winter-themed with snow effects
- **Pause Menu**: ESC to pause, save, or access settings
- **Localization**: English and Russian language support
- **Debug Console**: Configurable debug commands for testing (can be disabled)

## Controls

### Main Menu
- **Arrow Keys**: Navigate menu
- **Enter**: Select option
- **ESC**: Go back

### In-Game
- **A/D or Arrow Keys**: Move left/right
- **Space**: Chop tree (when near a tree)
- **E**: Open shop (when near shop)
- **ESC**: Pause menu
- **~ (Tilde)**: Toggle debug console (if enabled)

### Shop Menu
- **1**: Hire Lumberjack Worker
- **2**: Hire Cashier
- **3**: Upgrade Axes
- **4**: Upgrade Warehouse
- **E or ESC**: Close shop

## Debug Console Commands

(Available when `DEBUG_CONSOLE_ENABLED` is true in config)

- `help` - Show all commands
- `money <amount>` - Add money
- `wood <amount>` - Add wood to warehouse
- `season <name>` - Change season (winter/spring/summer/fall)
- `spawn <type>` - Spawn NPC (lumberjack/cashier)
- `tp <x>` - Teleport player to X coordinate
- `god` - Toggle god mode (unlimited resources)
- `clear` - Clear console output

## Game Progression

1. **Early Game**: Manually chop trees (30 clicks each), sell wood to earn initial capital
2. **Mid Game**: Hire first worker and cashier, upgrade warehouse capacity
3. **Late Game**: Multiple workers with upgraded axes, large warehouse, passive income

## Configuration

Edit `js/config.js` to customize:
- Tree chop difficulty
- Upgrade costs
- Worker efficiency
- Season duration
- Debug settings
- Starting money
- World size

## Technical Details

- **Technology**: HTML5 Canvas, Pure JavaScript (ES6+)
- **Rendering**: Pixel-art style graphics
- **Save System**: LocalStorage-based save system
- **Architecture**: Modular class-based structure

## File Structure

```
XSw/
├── index.html              # Main HTML file
├── style.css              # Game styling
├── js/
│   ├── config.js          # Game configuration
│   ├── localization.js    # Multi-language support
│   ├── utils.js           # Utility functions
│   ├── input.js           # Input handling
│   ├── player.js          # Player character
│   ├── tree.js            # Tree mechanics
│   ├── npc.js             # NPC workers
│   ├── shop.js            # Shop and economy
│   ├── warehouse.js       # Storage system
│   ├── ui.js              # User interface
│   ├── saveload.js        # Save/load system
│   ├── world.js           # World and camera
│   ├── season.js          # Season system
│   ├── debug.js           # Debug console
│   ├── game.js            # Main game class
│   └── main.js            # Entry point
└── README.md              # This file
```

## How to Play

1. Open `index.html` in a modern web browser
2. Select language in settings if desired
3. Start a new game or load existing save
4. Use A/D to move, Space to chop trees
5. Walk to shop (press E) to hire workers and buy upgrades
6. Build your wood market empire!

## Development

The game is designed with extensibility in mind:
- Easy to add new upgrades
- Modular NPC system for new worker types
- Configurable economy
- Expandable localization

## Credits

**Game Title**: WFLY WOOD MARKET
**Genre**: 2D Management/Clicker/Idle Game
**Style**: Pixel Art

---

Enjoy building your wood market empire! 🪓🌲💰
