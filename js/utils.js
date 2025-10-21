// Utility functions
class Utils {
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    static rectCollision(r1, r2) {
        return r1.x < r2.x + r2.w &&
               r1.x + r1.w > r2.x &&
               r1.y < r2.y + r2.h &&
               r1.y + r1.h > r2.y;
    }

    static pointInRect(px, py, rect) {
        return px >= rect.x && px <= rect.x + rect.w &&
               py >= rect.y && py <= rect.y + rect.h;
    }

    static drawText(ctx, text, x, y, size = 16, color = '#fff', align = 'left') {
        ctx.save();
        ctx.font = `${size}px 'Courier New', monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    static drawRect(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    static drawRectOutline(ctx, x, y, w, h, color, lineWidth = 2) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x, y, w, h);
    }

    static drawCircle(ctx, x, y, radius, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    static drawPixelRect(ctx, x, y, w, h, color) {
        // Draw a pixelated rectangle
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    }
}
