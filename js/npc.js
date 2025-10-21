// NPC Worker class
class NPC {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 48;
        this.type = type; // 'lumberjack' or 'cashier'
        this.state = 'idle'; // idle, walking, chopping, working
        this.targetTree = null;
        this.chopTimer = 0;
        this.axeLevel = 0; // 0 = basic, higher = faster chopping
        this.woodCarrying = 0;
        this.direction = 1;
    }

    update(deltaTime, trees, warehouse) {
        if (this.type === 'lumberjack') {
            this.updateLumberjack(deltaTime, trees, warehouse);
        } else if (this.type === 'cashier') {
            this.updateCashier(deltaTime);
        }
    }

    updateLumberjack(deltaTime, trees, warehouse) {
        if (this.state === 'idle') {
            // Find nearest available tree
            this.targetTree = this.findNearestTree(trees);
            if (this.targetTree) {
                this.state = 'walking';
            }
        } else if (this.state === 'walking') {
            // Move towards tree
            if (this.targetTree && !this.targetTree.isChopped) {
                const dx = this.targetTree.x - this.x;
                this.direction = dx > 0 ? 1 : -1;
                
                if (Math.abs(dx) < 50) {
                    this.state = 'chopping';
                    this.chopTimer = 0;
                } else {
                    this.x += this.direction * 2;
                }
            } else {
                this.state = 'idle';
                this.targetTree = null;
            }
        } else if (this.state === 'chopping') {
            if (this.targetTree && !this.targetTree.isChopped) {
                this.chopTimer += deltaTime;
                const chopTime = CONFIG.NPC_CHOP_TIME / (1 + this.axeLevel * 0.5);
                
                if (this.chopTimer >= chopTime) {
                    const chopped = this.targetTree.chop();
                    this.chopTimer = 0;
                    
                    if (chopped) {
                        this.woodCarrying++;
                        this.state = 'returning';
                    }
                }
            } else {
                this.state = 'idle';
                this.targetTree = null;
            }
        } else if (this.state === 'returning') {
            // Return to warehouse
            const warehouseX = 150;
            const dx = warehouseX - this.x;
            this.direction = dx > 0 ? 1 : -1;
            
            if (Math.abs(dx) < 20) {
                // Deposit wood
                warehouse.addWood(this.woodCarrying);
                this.woodCarrying = 0;
                this.state = 'idle';
            } else {
                this.x += this.direction * 2;
            }
        }
    }

    updateCashier(deltaTime) {
        // Cashier stays at shop and serves customers
        // For now, just idle animation
        this.state = 'working';
    }

    findNearestTree(trees) {
        let nearest = null;
        let minDist = Infinity;

        for (const tree of trees) {
            if (!tree.isChopped) {
                const dist = Math.abs(tree.x - this.x);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = tree;
                }
            }
        }

        return nearest;
    }

    upgradeAxe() {
        this.axeLevel++;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;

        // Color based on type
        const color = this.type === 'lumberjack' ? '#4169E1' : '#FF6347';

        // Body
        Utils.drawPixelRect(ctx, screenX, this.y, this.width, this.height, color);

        // Head
        Utils.drawPixelRect(ctx, screenX + 8, this.y - 8, 16, 16, '#FFD4A3');

        // Eye
        ctx.fillStyle = '#000';
        if (this.direction === 1) {
            ctx.fillRect(screenX + 18, this.y - 4, 4, 4);
        } else {
            ctx.fillRect(screenX + 10, this.y - 4, 4, 4);
        }

        // Tool indicator
        if (this.type === 'lumberjack') {
            ctx.fillStyle = '#654321';
            const toolX = this.direction === 1 ? screenX + this.width : screenX - 6;
            ctx.fillRect(toolX, this.y + 10, 6, 16);
            ctx.fillStyle = '#888';
            ctx.fillRect(toolX, this.y + 8, 6, 6);

            // Wood carrying indicator
            if (this.woodCarrying > 0) {
                Utils.drawText(ctx, `🪵${this.woodCarrying}`, screenX, this.y - 20, 12, '#fff', 'center');
            }
        }

        // State indicator (debug)
        if (CONFIG.DEBUG_ENABLED) {
            Utils.drawText(ctx, this.state, screenX, this.y - 30, 8, '#0f0', 'center');
        }
    }
}
