// Shop and Economy system
class Shop {
    constructor() {
        this.x = 100;
        this.y = 300;
        this.width = 200;
        this.height = 150;
        this.isOpen = false;
        
        this.upgrades = {
            workers: 0,
            cashiers: 0,
            axeLevel: 0,
            warehouseLevel: 0,
        };
    }

    canAfford(cost, money) {
        return money >= cost;
    }

    hireWorker(game) {
        const cost = CONFIG.UPGRADES.WORKER_COST * (this.upgrades.workers + 1);
        if (this.canAfford(cost, game.money)) {
            game.money -= cost;
            this.upgrades.workers++;
            
            // Spawn NPC worker
            const npc = new NPC(this.x + 50, this.y + this.height, 'lumberjack');
            game.npcs.push(npc);
            
            return true;
        }
        return false;
    }

    hireCashier(game) {
        const cost = CONFIG.UPGRADES.CASHIER_COST * (this.upgrades.cashiers + 1);
        if (this.canAfford(cost, game.money)) {
            game.money -= cost;
            this.upgrades.cashiers++;
            
            // Spawn cashier
            const npc = new NPC(this.x + 100, this.y + 50, 'cashier');
            game.npcs.push(npc);
            
            return true;
        }
        return false;
    }

    upgradeAxe(game) {
        const cost = CONFIG.UPGRADES.WORKER_AXE_UPGRADE_COST * (this.upgrades.axeLevel + 1);
        if (this.canAfford(cost, game.money)) {
            game.money -= cost;
            this.upgrades.axeLevel++;
            
            // Upgrade all lumberjack NPCs
            for (const npc of game.npcs) {
                if (npc.type === 'lumberjack') {
                    npc.upgradeAxe();
                }
            }
            
            return true;
        }
        return false;
    }

    upgradeWarehouse(game) {
        const cost = CONFIG.UPGRADES.WAREHOUSE_UPGRADE_COST * (this.upgrades.warehouseLevel + 1);
        if (this.canAfford(cost, game.money)) {
            game.money -= cost;
            this.upgrades.warehouseLevel++;
            game.warehouse.upgrade();
            return true;
        }
        return false;
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;

        // Shop building
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(screenX, this.y, this.width, this.height);

        // Roof
        ctx.fillStyle = '#654321';
        ctx.beginPath();
        ctx.moveTo(screenX - 10, this.y);
        ctx.lineTo(screenX + this.width / 2, this.y - 30);
        ctx.lineTo(screenX + this.width + 10, this.y);
        ctx.closePath();
        ctx.fill();

        // Window
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(screenX + 20, this.y + 30, 40, 40);

        // Door
        ctx.fillStyle = '#654321';
        ctx.fillRect(screenX + 140, this.y + 70, 40, 80);

        // Sign
        ctx.fillStyle = '#FFF';
        ctx.fillRect(screenX + 70, this.y + 10, 60, 30);
        Utils.drawText(ctx, 'SHOP', screenX + 100, this.y + 18, 12, '#000', 'center');

        // Interaction prompt
        Utils.drawText(ctx, 'Press E to open', screenX + this.width / 2, this.y - 10, 12, '#fff', 'center');
    }

    drawUI(ctx, game) {
        if (!this.isOpen) return;

        const menuX = 300;
        const menuY = 100;
        const menuW = 600;
        const menuH = 400;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(menuX, menuY, menuW, menuH);

        // Border
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.strokeRect(menuX, menuY, menuW, menuH);

        // Title
        Utils.drawText(ctx, i18n.t('SHOP.TITLE'), menuX + menuW / 2, menuY + 20, 24, '#FFD700', 'center');

        // Upgrades list
        const startY = menuY + 70;
        const lineHeight = 60;

        // Worker
        const workerCost = CONFIG.UPGRADES.WORKER_COST * (this.upgrades.workers + 1);
        this.drawUpgradeOption(ctx, menuX + 50, startY, 
            `${i18n.t('SHOP.HIRE_WORKER')} (${this.upgrades.workers})`, 
            workerCost, game.money);

        // Cashier
        const cashierCost = CONFIG.UPGRADES.CASHIER_COST * (this.upgrades.cashiers + 1);
        this.drawUpgradeOption(ctx, menuX + 50, startY + lineHeight,
            `${i18n.t('SHOP.HIRE_CASHIER')} (${this.upgrades.cashiers})`,
            cashierCost, game.money);

        // Axe upgrade
        const axeCost = CONFIG.UPGRADES.WORKER_AXE_UPGRADE_COST * (this.upgrades.axeLevel + 1);
        this.drawUpgradeOption(ctx, menuX + 50, startY + lineHeight * 2,
            `${i18n.t('SHOP.UPGRADE_AXE')} Lv.${this.upgrades.axeLevel}`,
            axeCost, game.money);

        // Warehouse upgrade
        const warehouseCost = CONFIG.UPGRADES.WAREHOUSE_UPGRADE_COST * (this.upgrades.warehouseLevel + 1);
        this.drawUpgradeOption(ctx, menuX + 50, startY + lineHeight * 3,
            `${i18n.t('SHOP.UPGRADE_WAREHOUSE')} Lv.${this.upgrades.warehouseLevel}`,
            warehouseCost, game.money);

        // Close instruction
        Utils.drawText(ctx, 'Press E or ESC to close', menuX + menuW / 2, menuY + menuH - 30, 14, '#fff', 'center');
    }

    drawUpgradeOption(ctx, x, y, text, cost, playerMoney) {
        const canAfford = playerMoney >= cost;
        const color = canAfford ? '#0f0' : '#f00';

        Utils.drawText(ctx, text, x, y, 16, '#fff');
        Utils.drawText(ctx, `Cost: $${cost}`, x, y + 20, 14, color);
    }
}
