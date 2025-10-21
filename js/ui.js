// UI and HUD
class UI {
    constructor() {
        this.messages = [];
        this.messageTimer = 0;
    }

    update(deltaTime) {
        if (this.messageTimer > 0) {
            this.messageTimer -= deltaTime;
        }
    }

    showMessage(text, duration = 2000) {
        this.messages.unshift({ text, time: duration });
        this.messageTimer = duration;
        
        // Keep only last 3 messages
        if (this.messages.length > 3) {
            this.messages.pop();
        }
    }

    drawHUD(ctx, game) {
        const padding = 20;

        // Money
        Utils.drawText(ctx, `${i18n.t('HUD.MONEY')}: $${game.money}`, padding, padding, 20, '#FFD700');

        // Wood count
        Utils.drawText(ctx, `${i18n.t('HUD.WOOD')}: ${game.warehouse.wood}/${game.warehouse.capacity}`, 
            padding, padding + 30, 18, '#8B4513');

        // Season
        const seasonName = i18n.t(`SEASONS.${game.season.getCurrentSeason().toUpperCase()}`);
        Utils.drawText(ctx, `${i18n.t('HUD.SEASON')}: ${seasonName}`, 
            CONFIG.CANVAS_WIDTH - padding, padding, 18, '#FFF', 'right');

        // Season progress bar
        const barW = 200;
        const barH = 10;
        const barX = CONFIG.CANVAS_WIDTH - padding - barW;
        const barY = padding + 25;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        
        const progress = game.season.getSeasonProgress();
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(barX, barY, barW * progress, barH);
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Messages
        this.drawMessages(ctx);

        // Controls hint
        this.drawControls(ctx);
    }

    drawMessages(ctx) {
        const startY = CONFIG.CANVAS_HEIGHT - 100;
        
        for (let i = 0; i < this.messages.length; i++) {
            const msg = this.messages[i];
            const alpha = Math.min(1, msg.time / 500);
            const y = startY - i * 25;
            
            ctx.save();
            ctx.globalAlpha = alpha;
            Utils.drawText(ctx, msg.text, CONFIG.CANVAS_WIDTH / 2, y, 16, '#FFF', 'center');
            ctx.restore();
            
            msg.time -= 16; // Approximate frame time
        }
        
        // Remove expired messages
        this.messages = this.messages.filter(m => m.time > 0);
    }

    drawControls(ctx) {
        const controls = [
            'A/D or Arrow Keys: Move',
            'Space: Chop Tree',
            'E: Open Shop',
            'ESC: Pause Menu',
        ];

        if (CONFIG.DEBUG_CONSOLE_ENABLED) {
            controls.push('~ (tilde): Debug Console');
        }

        const startY = CONFIG.CANVAS_HEIGHT - 20 - controls.length * 15;
        
        for (let i = 0; i < controls.length; i++) {
            Utils.drawText(ctx, controls[i], 20, startY + i * 15, 12, 'rgba(255, 255, 255, 0.5)');
        }
    }

    drawMainMenu(ctx, selectedOption = 0) {
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Winter scene background
        const season = new SeasonManager();
        season.currentSeasonIndex = 0; // Winter
        
        // Sky
        ctx.fillStyle = season.getSkyColor();
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT / 2);
        
        // Snow
        season.drawSnow(ctx);

        // Title
        const title = i18n.t('GAME_TITLE');
        ctx.save();
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 10;
        Utils.drawText(ctx, title, CONFIG.CANVAS_WIDTH / 2, 80, 48, '#FFD700', 'center');
        ctx.restore();

        // Menu options
        const options = [
            i18n.t('MAIN_MENU.NEW_GAME'),
            i18n.t('MAIN_MENU.LOAD_GAME'),
            i18n.t('MAIN_MENU.SETTINGS'),
        ];

        const startY = 250;
        const lineHeight = 50;

        for (let i = 0; i < options.length; i++) {
            const y = startY + i * lineHeight;
            const isSelected = i === selectedOption;
            const color = isSelected ? '#FFD700' : '#FFF';
            const size = isSelected ? 28 : 24;

            if (isSelected) {
                Utils.drawText(ctx, '>', CONFIG.CANVAS_WIDTH / 2 - 150, y, size, color);
            }

            Utils.drawText(ctx, options[i], CONFIG.CANVAS_WIDTH / 2, y, size, color, 'center');
        }

        // Instructions
        Utils.drawText(ctx, 'Use Arrow Keys and Enter', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 50, 16, '#AAA', 'center');
    }

    drawPauseMenu(ctx, selectedOption = 0) {
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Menu box
        const boxW = 400;
        const boxH = 350;
        const boxX = (CONFIG.CANVAS_WIDTH - boxW) / 2;
        const boxY = (CONFIG.CANVAS_HEIGHT - boxH) / 2;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(boxX, boxY, boxW, boxH);

        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Title
        Utils.drawText(ctx, 'PAUSED', boxX + boxW / 2, boxY + 30, 32, '#FFD700', 'center');

        // Options
        const options = [
            i18n.t('PAUSE_MENU.RESUME'),
            i18n.t('PAUSE_MENU.SAVE'),
            i18n.t('PAUSE_MENU.SETTINGS'),
            i18n.t('PAUSE_MENU.MAIN_MENU'),
        ];

        const startY = boxY + 100;
        const lineHeight = 50;

        for (let i = 0; i < options.length; i++) {
            const y = startY + i * lineHeight;
            const isSelected = i === selectedOption;
            const color = isSelected ? '#FFD700' : '#FFF';
            const size = isSelected ? 24 : 20;

            if (isSelected) {
                Utils.drawText(ctx, '>', boxX + 80, y, size, color);
            }

            Utils.drawText(ctx, options[i], boxX + boxW / 2, y, size, color, 'center');
        }
    }

    drawSaveSlots(ctx, saves, selectedSlot = 0) {
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Title
        Utils.drawText(ctx, i18n.t('SAVE_SLOTS.SLOT'), CONFIG.CANVAS_WIDTH / 2, 50, 32, '#FFD700', 'center');

        // Slots
        const slotW = 500;
        const slotH = 80;
        const startY = 120;
        const spacing = 20;

        for (let i = 0; i < CONFIG.MAX_SAVE_SLOTS; i++) {
            const y = startY + i * (slotH + spacing);
            const x = (CONFIG.CANVAS_WIDTH - slotW) / 2;
            const isSelected = i === selectedSlot;

            // Slot box
            ctx.fillStyle = isSelected ? '#2a2a4e' : '#1a1a2e';
            ctx.fillRect(x, y, slotW, slotH);

            ctx.strokeStyle = isSelected ? '#FFD700' : '#666';
            ctx.lineWidth = isSelected ? 3 : 1;
            ctx.strokeRect(x, y, slotW, slotH);

            // Slot content
            const save = saves[i];
            if (save) {
                Utils.drawText(ctx, `${i18n.t('SAVE_SLOTS.SLOT')} ${i + 1}`, x + 20, y + 15, 20, '#FFF');
                Utils.drawText(ctx, `${i18n.t('HUD.MONEY')}: $${save.money}`, x + 20, y + 40, 16, '#AAA');
                Utils.drawText(ctx, new Date(save.timestamp).toLocaleString(), x + slotW - 20, y + 40, 14, '#888', 'right');
            } else {
                Utils.drawText(ctx, `${i18n.t('SAVE_SLOTS.SLOT')} ${i + 1} - ${i18n.t('SAVE_SLOTS.EMPTY')}`, 
                    x + 20, y + 30, 20, '#666');
            }
        }

        // Instructions
        Utils.drawText(ctx, `${i18n.t('SAVE_SLOTS.BACK')}: ESC`, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 50, 16, '#AAA', 'center');
    }
}
