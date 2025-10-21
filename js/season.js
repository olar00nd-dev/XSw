// Season system
class SeasonManager {
    constructor() {
        this.seasons = ['winter', 'spring', 'summer', 'fall'];
        this.currentSeasonIndex = 0;
        this.seasonTimer = 0;
        this.seasonDuration = CONFIG.SEASON_DURATION;
    }

    update(deltaTime) {
        this.seasonTimer += deltaTime;
        
        if (this.seasonTimer >= this.seasonDuration) {
            this.seasonTimer = 0;
            this.currentSeasonIndex = (this.currentSeasonIndex + 1) % this.seasons.length;
        }
    }

    getCurrentSeason() {
        return this.seasons[this.currentSeasonIndex];
    }

    getSeasonProgress() {
        return this.seasonTimer / this.seasonDuration;
    }

    getSkyColor() {
        const season = this.getCurrentSeason();
        switch (season) {
            case 'winter': return '#B0C4DE'; // Light steel blue
            case 'spring': return '#87CEEB'; // Sky blue
            case 'summer': return '#00BFFF'; // Deep sky blue
            case 'fall': return '#FFA07A'; // Light salmon
            default: return '#87CEEB';
        }
    }

    getGroundColor() {
        const season = this.getCurrentSeason();
        switch (season) {
            case 'winter': return '#FFFAFA'; // Snow white
            case 'spring': return '#90EE90'; // Light green
            case 'summer': return '#228B22'; // Forest green
            case 'fall': return '#CD853F'; // Peru brown
            default: return '#228B22';
        }
    }

    drawParticles(ctx, camera) {
        const season = this.getCurrentSeason();
        
        if (season === 'winter') {
            this.drawSnow(ctx);
        } else if (season === 'fall') {
            this.drawLeaves(ctx);
        }
    }

    drawSnow(ctx) {
        ctx.fillStyle = '#FFF';
        const time = Date.now() / 1000;
        
        for (let i = 0; i < 50; i++) {
            const x = (i * 47 + time * 30 + i * 13) % CONFIG.CANVAS_WIDTH;
            const y = (i * 71 + time * 50 + i * 17) % CONFIG.CANVAS_HEIGHT;
            const size = 2 + (i % 3);
            
            ctx.fillRect(x, y, size, size);
        }
    }

    drawLeaves(ctx) {
        ctx.fillStyle = '#D2691E';
        const time = Date.now() / 1000;
        
        for (let i = 0; i < 30; i++) {
            const x = (i * 53 + time * 20 + i * 19) % CONFIG.CANVAS_WIDTH;
            const y = (i * 67 + time * 40 + i * 23) % CONFIG.CANVAS_HEIGHT;
            const size = 3 + (i % 2);
            
            ctx.fillRect(x, y, size, size);
        }
    }
}
