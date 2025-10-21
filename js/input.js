// Input handling
class InputManager {
    constructor() {
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;
        this.mouseClicked = false;
        this.mouseButton = 0;

        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });

        const canvas = document.getElementById('gameCanvas');
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            this.mouseClicked = true;
            this.mouseButton = e.button;
        });

        canvas.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    isKeyDown(key) {
        return !!this.keys[key.toLowerCase()] || !!this.keys[key];
    }

    isKeyPressed(key) {
        // For single press detection, need to track previous frame
        return this.isKeyDown(key);
    }

    wasMouseClicked() {
        const clicked = this.mouseClicked;
        this.mouseClicked = false;
        return clicked;
    }

    getMousePos() {
        return { x: this.mouseX, y: this.mouseY };
    }

    reset() {
        this.mouseClicked = false;
    }
}
