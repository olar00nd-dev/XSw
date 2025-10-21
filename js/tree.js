// Tree class
class Tree {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.TREE_WIDTH;
        this.height = CONFIG.TREE_HEIGHT;
        this.chopCount = 0;
        this.maxChops = CONFIG.TREE_CHOP_CLICKS;
        this.isChopped = false;
        this.respawnTimer = 0;
        this.respawnTime = CONFIG.TREE_RESPAWN_TIME;
    }

    chop() {
        if (!this.isChopped) {
            this.chopCount++;
            if (this.chopCount >= this.maxChops) {
                this.isChopped = true;
                this.respawnTimer = this.respawnTime;
                return true; // Tree fully chopped
            }
        }
        return false;
    }

    update(deltaTime) {
        if (this.isChopped) {
            this.respawnTimer -= deltaTime;
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
        }
    }

    respawn() {
        this.chopCount = 0;
        this.isChopped = false;
        this.respawnTimer = 0;
    }

    getProgress() {
        return this.chopCount / this.maxChops;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;

        if (this.isChopped) {
            // Draw stump
            ctx.fillStyle = '#654321';
            ctx.fillRect(screenX + 20, this.y + this.height - 20, 24, 20);
            
            // Draw timer text
            const timeLeft = Math.ceil(this.respawnTimer / 1000);
            Utils.drawText(ctx, `${timeLeft}s`, screenX + this.width / 2, this.y + this.height - 40, 12, '#fff', 'center');
        } else {
            // Draw tree
            // Trunk
            ctx.fillStyle = '#654321';
            ctx.fillRect(screenX + 20, this.y + 40, 24, this.height - 40);
            
            // Leaves (pixel style)
            ctx.fillStyle = '#228B22';
            // Layer 1
            ctx.fillRect(screenX + 8, this.y + 20, 48, 16);
            // Layer 2
            ctx.fillRect(screenX + 12, this.y + 8, 40, 16);
            // Layer 3
            ctx.fillRect(screenX + 16, this.y, 32, 12);

            // Progress bar if being chopped
            if (this.chopCount > 0) {
                const barWidth = 60;
                const barHeight = 6;
                const barX = screenX + (this.width - barWidth) / 2;
                const barY = this.y - 15;

                // Background
                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, barHeight);

                // Progress
                const progress = this.getProgress();
                ctx.fillStyle = progress < 0.5 ? '#0f0' : progress < 0.8 ? '#ff0' : '#f00';
                ctx.fillRect(barX, barY, barWidth * progress, barHeight);

                // Border
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);

                // Count text
                Utils.drawText(ctx, `${this.chopCount}/${this.maxChops}`, screenX + this.width / 2, barY - 15, 10, '#fff', 'center');
            }
        }
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            w: this.width,
            h: this.height,
        };
    }
}
