// Book Scene Controller
// Displays Wikipedia images as pages of a virtual book

class BookScene extends SceneController {
    constructor() {
        super('book');
        this.bookPages = [];
        this.currentPage = 0;
        this.isPageTurning = false;
        this.pageTurnTimer = 0;
        this.bookGroup = null;
    }

    // No walls for book scene
    generateLayout(size) {
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));
        return { horizontalWalls, verticalWalls };
    }

    // Create book 3D structure
    createContent(group, textureStyle, size) {
        this.bookGroup = new THREE.Group();

        const bookWidth = 4;
        const bookHeight = 5;
        const pageDepth = 0.02;
        const bookSpineWidth = 0.3;
        const bookAngle = Math.PI / 12;

        // Book cover materials
        const coverMaterial = new THREE.MeshLambertMaterial({ color: 0x4A2810 });
        const spineMaterial = new THREE.MeshLambertMaterial({ color: 0x3A1808 });

        // Spine
        const spineGeometry = new THREE.BoxGeometry(bookSpineWidth, bookHeight, pageDepth * 10);
        const spine = new THREE.Mesh(spineGeometry, spineMaterial);
        spine.position.set(0, bookHeight / 2, 0);
        this.bookGroup.add(spine);

        // Left page backing
        const leftBackingGeometry = new THREE.BoxGeometry(bookWidth, bookHeight, pageDepth);
        const leftBacking = new THREE.Mesh(leftBackingGeometry, coverMaterial);
        leftBacking.position.set(-bookWidth / 2 - bookSpineWidth / 2, bookHeight / 2, 0);
        leftBacking.rotation.y = bookAngle;
        this.bookGroup.add(leftBacking);

        // Right page backing
        const rightBacking = new THREE.Mesh(leftBackingGeometry.clone(), coverMaterial);
        rightBacking.position.set(bookWidth / 2 + bookSpineWidth / 2, bookHeight / 2, 0);
        rightBacking.rotation.y = -bookAngle;
        this.bookGroup.add(rightBacking);

        // Page material
        const pageMaterial = new THREE.MeshLambertMaterial({ color: 0xFFF8E7 });

        // Left page surface
        const pageGeometry = new THREE.PlaneGeometry(bookWidth * 0.9, bookHeight * 0.85);
        const leftPage = new THREE.Mesh(pageGeometry, pageMaterial.clone());
        leftPage.position.set(-bookWidth / 2 - bookSpineWidth / 2 - 0.05, bookHeight / 2, pageDepth / 2 + 0.01);
        leftPage.rotation.y = bookAngle;
        leftPage.name = 'leftPage';
        this.bookGroup.add(leftPage);

        // Right page surface
        const rightPage = new THREE.Mesh(pageGeometry.clone(), pageMaterial.clone());
        rightPage.position.set(bookWidth / 2 + bookSpineWidth / 2 + 0.05, bookHeight / 2, pageDepth / 2 + 0.01);
        rightPage.rotation.y = -bookAngle;
        rightPage.name = 'rightPage';
        this.bookGroup.add(rightPage);

        // Position book
        this.bookGroup.position.set(0, 0, -3);
        group.add(this.bookGroup);

        // Store references
        window.bookLeftPage = leftPage;
        window.bookRightPage = rightPage;
        window.bookWidth = bookWidth;
        window.bookHeight = bookHeight;

        // Load initial pages
        this.loadPages();
    }

    async loadPages() {
        const textureLoader = new THREE.TextureLoader();

        for (let i = 0; i < 2; i++) {
            const pageIndex = this.currentPage + i;

            if (this.bookPages[pageIndex]) continue;

            const imageData = await getWikipediaImage();
            if (imageData) {
                this.bookPages[pageIndex] = imageData;
            }
        }

        this.updatePageDisplay();
    }

    updatePageDisplay() {
        if (!window.bookLeftPage || !window.bookRightPage) return;

        const textureLoader = new THREE.TextureLoader();

        // Update left page
        const leftData = this.bookPages[this.currentPage];
        if (leftData && leftData.imageUrl) {
            this.loadPageTexture(leftData, window.bookLeftPage);
        }

        // Update right page
        const rightData = this.bookPages[this.currentPage + 1];
        if (rightData && rightData.imageUrl) {
            this.loadPageTexture(rightData, window.bookRightPage);
        }
    }

    loadPageTexture(pageData, pageMesh) {
        const textureLoader = new THREE.TextureLoader();

        textureLoader.load(pageData.imageUrl, (texture) => {
            if (sceneMode !== 'book') return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 512;
            canvas.height = 640;

            ctx.fillStyle = '#FFF8E7';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const img = texture.image;
            const imgAspect = img.width / img.height;
            const targetWidth = canvas.width * 0.85;
            const targetHeight = canvas.height * 0.7;
            let drawWidth, drawHeight;

            if (imgAspect > targetWidth / targetHeight) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
            } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
            }

            const x = (canvas.width - drawWidth) / 2;
            const y = 30;
            ctx.drawImage(img, x, y, drawWidth, drawHeight);

            // Draw title
            ctx.fillStyle = '#2A1408';
            ctx.font = 'bold 24px Georgia, serif';
            ctx.textAlign = 'center';
            const title = pageData.title || 'Untitled';
            const maxWidth = canvas.width * 0.9;

            const words = title.split(' ');
            let line = '';
            let titleY = y + drawHeight + 40;
            for (let word of words) {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > maxWidth && line !== '') {
                    ctx.fillText(line.trim(), canvas.width / 2, titleY);
                    line = word + ' ';
                    titleY += 30;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line.trim(), canvas.width / 2, titleY);

            const pageTexture = new THREE.CanvasTexture(canvas);
            pageMesh.material.map = pageTexture;
            pageMesh.material.needsUpdate = true;
        });
    }

    async turnPageForward() {
        if (this.isPageTurning) return;

        this.isPageTurning = true;
        this.currentPage += 2;
        await this.loadPages();
        this.isPageTurning = false;
    }

    turnPageBackward() {
        if (this.isPageTurning || this.currentPage < 2) return;

        this.isPageTurning = true;
        this.currentPage -= 2;
        this.updatePageDisplay();
        this.isPageTurning = false;
    }

    // Dark background
    getSceneSetup() {
        return {
            background: 0x000000,
            fog: null,
            ambientIntensity: 0.6
        };
    }

    // Camera position for viewing book
    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    // Reset book state
    onEnterScene() {
        this.bookPages = [];
        this.currentPage = 0;
        this.isPageTurning = false;
        this.pageTurnTimer = 0;
    }

    // No minimap for book
    showMinimap() {
        return false;
    }

    // Auto page turning update
    update(deltaTime) {
        if (autoMode && !this.isPageTurning) {
            this.pageTurnTimer++;
            if (this.pageTurnTimer >= 300) { // ~5 seconds at 60fps
                this.pageTurnTimer = 0;
                this.turnPageForward();
            }
        }
    }
}

// Register the book scene
registerScene('book', new BookScene());

// Global helper functions for key handling
function turnBookPageForward() {
    const scene = scenes['book'];
    if (scene) scene.turnPageForward();
}

function turnBookPageBackward() {
    const scene = scenes['book'];
    if (scene) scene.turnPageBackward();
}
