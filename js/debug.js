// Debug console
class DebugConsole {
    constructor() {
        this.isOpen = false;
        this.consoleElement = document.getElementById('debugConsole');
        this.inputElement = document.getElementById('consoleInput');
        this.outputElement = document.getElementById('consoleOutput');
        this.commandHistory = [];
        this.historyIndex = -1;

        if (CONFIG.DEBUG_CONSOLE_ENABLED) {
            this.setupListeners();
        }
    }

    setupListeners() {
        this.inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand(this.inputElement.value);
                this.inputElement.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    this.inputElement.value = this.commandHistory[this.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.inputElement.value = this.commandHistory[this.historyIndex];
                } else {
                    this.historyIndex = -1;
                    this.inputElement.value = '';
                }
            }
        });
    }

    toggle() {
        if (!CONFIG.DEBUG_CONSOLE_ENABLED) return;
        
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.consoleElement.classList.remove('hidden');
            this.inputElement.focus();
        } else {
            this.consoleElement.classList.add('hidden');
        }
    }

    executeCommand(cmd) {
        if (!cmd.trim()) return;

        this.commandHistory.unshift(cmd);
        this.historyIndex = -1;

        this.log(`> ${cmd}`);

        const parts = cmd.trim().split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        try {
            switch (command) {
                case 'help':
                    this.log('Available commands:');
                    this.log('  money <amount> - Add money');
                    this.log('  wood <amount> - Add wood');
                    this.log('  season <name> - Change season (winter/spring/summer/fall)');
                    this.log('  spawn <type> - Spawn NPC (lumberjack/cashier)');
                    this.log('  clear - Clear console');
                    this.log('  tp <x> - Teleport player');
                    this.log('  god - Toggle invincibility/unlimited resources');
                    break;

                case 'money':
                    if (args[0] && !isNaN(args[0])) {
                        window.game.money += parseInt(args[0]);
                        this.log(`Added $${args[0]}. Total: $${window.game.money}`, 'success');
                    } else {
                        this.log('Usage: money <amount>', 'error');
                    }
                    break;

                case 'wood':
                    if (args[0] && !isNaN(args[0])) {
                        window.game.warehouse.addWood(parseInt(args[0]));
                        this.log(`Added ${args[0]} wood. Total: ${window.game.warehouse.wood}`, 'success');
                    } else {
                        this.log('Usage: wood <amount>', 'error');
                    }
                    break;

                case 'season':
                    if (args[0]) {
                        const seasons = ['winter', 'spring', 'summer', 'fall'];
                        const index = seasons.indexOf(args[0].toLowerCase());
                        if (index !== -1) {
                            window.game.season.currentSeasonIndex = index;
                            this.log(`Season changed to ${args[0]}`, 'success');
                        } else {
                            this.log('Invalid season. Use: winter/spring/summer/fall', 'error');
                        }
                    } else {
                        this.log('Usage: season <name>', 'error');
                    }
                    break;

                case 'spawn':
                    if (args[0]) {
                        const type = args[0].toLowerCase();
                        if (type === 'lumberjack' || type === 'cashier') {
                            const npc = new NPC(window.game.player.x + 100, window.game.player.y, type);
                            window.game.npcs.push(npc);
                            this.log(`Spawned ${type}`, 'success');
                        } else {
                            this.log('Invalid NPC type. Use: lumberjack/cashier', 'error');
                        }
                    } else {
                        this.log('Usage: spawn <type>', 'error');
                    }
                    break;

                case 'tp':
                    if (args[0] && !isNaN(args[0])) {
                        window.game.player.x = parseInt(args[0]);
                        this.log(`Teleported to x=${args[0]}`, 'success');
                    } else {
                        this.log('Usage: tp <x>', 'error');
                    }
                    break;

                case 'clear':
                    this.outputElement.innerHTML = '';
                    break;

                case 'god':
                    window.game.godMode = !window.game.godMode;
                    this.log(`God mode: ${window.game.godMode ? 'ON' : 'OFF'}`, 'success');
                    break;

                default:
                    this.log(`Unknown command: ${command}. Type 'help' for commands.`, 'error');
            }
        } catch (e) {
            this.log(`Error: ${e.message}`, 'error');
        }
    }

    log(message, type = 'normal') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = message;
        this.outputElement.appendChild(line);
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }
}
