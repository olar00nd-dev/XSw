// World and Camera
class World {
    constructor() {
        this.width = CONFIG.WORLD_WIDTH;
        this.minX = CONFIG.WORLD_MIN_X;
        this.ground = CONFIG.CANVAS_HEIGHT - 50;
        
        this.trees = this.generateTrees();
    }

    generateTrees() {
        const trees = [];
        const treeCount = 15;
        
        for (let i = 0; i < treeCount; i++) {
            const x = 400 + i * 180 + Utils.randomInt(-20, 20);
            const y = this.ground - CONFIG.TREE_HEIGHT;
            trees.push(new Tree(x, y));
        }
        
        return trees;
    }

    update(deltaTime) {
        for (const tree of this.trees) {
            tree.update(deltaTime);
        }
    }

    draw(ctx, camera, season) {
        // Sky
        ctx.fillStyle = season.getSkyColor();
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Ground
        ctx.fillStyle = season.getGroundColor();
        ctx.fillRect(0, this.ground, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT - this.ground);

        // Ground line
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.ground);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, this.ground);
        ctx.stroke();

        // Draw trees
        for (const tree of this.trees) {
            tree.draw(ctx, camera);
        }
    }
}

class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
    }

    follow(target) {
        // Center on target with some offset
        this.targetX = target.x - CONFIG.CANVAS_WIDTH / 2 + target.width / 2;
        
        // Clamp to world bounds
        this.targetX = Utils.clamp(this.targetX, 0, CONFIG.WORLD_WIDTH - CONFIG.CANVAS_WIDTH);
        
        // Smooth follow
        this.x += (this.targetX - this.x) * 0.1;
    }

    reset() {
        this.x = 0;
        this.targetX = 0;
    }
}
