// Player class
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.PLAYER_WIDTH;
        this.height = CONFIG.PLAYER_HEIGHT;
        this.speed = CONFIG.PLAYER_SPEED;
        this.vx = 0;
        this.direction = 1; // 1 = right, -1 = left
        this.isChopping = false;
        this.choppingTree = null;
    }

    update(input, world) {
        // Movement
        this.vx = 0;
        
        if (input.isKeyDown('a') || input.isKeyDown('ArrowLeft')) {
            this.vx = -this.speed;
            this.direction = -1;
        } else if (input.isKeyDown('d') || input.isKeyDown('ArrowRight')) {
            this.vx = this.speed;
            this.direction = 1;
        }

        this.x += this.vx;

        // Clamp to world bounds
        this.x = Utils.clamp(this.x, CONFIG.WORLD_MIN_X, CONFIG.WORLD_WIDTH - this.width);

        // Stop chopping if moved
        if (this.vx !== 0) {
            this.isChopping = false;
            this.choppingTree = null;
        }
    }

    interact(trees) {
        // Find nearest tree
        let nearestTree = null;
        let minDist = 100; // Interaction distance

        for (const tree of trees) {
            if (!tree.isChopped) {
                const dist = Utils.distance(
                    this.x + this.width / 2,
                    this.y + this.height / 2,
                    tree.x + tree.width / 2,
                    tree.y + tree.height / 2
                );
                
                if (dist < minDist) {
                    minDist = dist;
                    nearestTree = tree;
                }
            }
        }

        return nearestTree;
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            w: this.width,
            h: this.height,
        };
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        
        // Draw player as a simple pixel character
        // Body
        Utils.drawPixelRect(ctx, screenX, this.y, this.width, this.height, '#8B4513');
        
        // Head
        Utils.drawPixelRect(ctx, screenX + 8, this.y - 8, 16, 16, '#FFD4A3');
        
        // Eyes
        ctx.fillStyle = '#000';
        if (this.direction === 1) {
            ctx.fillRect(screenX + 18, this.y - 4, 4, 4);
        } else {
            ctx.fillRect(screenX + 10, this.y - 4, 4, 4);
        }

        // Axe (if chopping)
        if (this.isChopping) {
            ctx.fillStyle = '#654321';
            const axeX = this.direction === 1 ? screenX + this.width : screenX - 8;
            ctx.fillRect(axeX, this.y + 10, 8, 20);
            ctx.fillStyle = '#888';
            ctx.fillRect(axeX, this.y + 8, 8, 8);
        }
    }
}
