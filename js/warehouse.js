// Warehouse system
class Warehouse {
    constructor() {
        this.wood = 0;
        this.capacity = CONFIG.WAREHOUSE_BASE_CAPACITY;
        this.level = 0;
        this.x = 150;
        this.y = 450;
        this.width = 120;
        this.height = 100;
    }

    addWood(amount) {
        const space = this.capacity - this.wood;
        const toAdd = Math.min(amount, space);
        this.wood += toAdd;
        return toAdd;
    }

    removeWood(amount) {
        const toRemove = Math.min(amount, this.wood);
        this.wood -= toRemove;
        return toRemove;
    }

    isFull() {
        return this.wood >= this.capacity;
    }

    upgrade() {
        this.level++;
        this.capacity += CONFIG.WAREHOUSE_UPGRADE_INCREASE;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;

        // Warehouse building
        ctx.fillStyle = '#696969';
        ctx.fillRect(screenX, this.y, this.width, this.height);

        // Roof
        ctx.fillStyle = '#505050';
        ctx.fillRect(screenX - 5, this.y - 10, this.width + 10, 10);

        // Door
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(screenX + 40, this.y + 50, 40, 50);

        // Sign
        ctx.fillStyle = '#FFF';
        ctx.fillRect(screenX + 10, this.y + 10, 100, 25);
        Utils.drawText(ctx, 'WAREHOUSE', screenX + 60, this.y + 15, 10, '#000', 'center');

        // Capacity bar
        const barW = 100;
        const barH = 8;
        const barX = screenX + 10;
        const barY = this.y - 25;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);

        const fillWidth = (this.wood / this.capacity) * barW;
        ctx.fillStyle = this.isFull() ? '#f00' : '#0f0';
        ctx.fillRect(barX, barY, fillWidth, barH);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        Utils.drawText(ctx, `${this.wood}/${this.capacity}`, screenX + 60, barY - 15, 12, '#fff', 'center');
    }
}
