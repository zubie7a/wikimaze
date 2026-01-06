// Complex Scene Controller
// "Big Rooms" layout with configurable room count using BSP

class ComplexScene extends SceneController {
    constructor() {
        super('complex');
        // Define number of rooms to generate
        this.targetRooms = 15;
    }

    // Generate layout with large connected rooms
    generateLayout(size) {
        // Initialize grid with all walls present (true)
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(true));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(true));

        const MIN_SIZE = 4; // Allow smaller rooms to reach higher room counts if needed

        // Use a priority-queue approach: split largest rooms first
        // Start with one root leaf
        let leaves = [{ x: 0, y: 0, w: size, h: size, leaf: true, splitH: null, splitPos: null, left: null, right: null }];

        // Split leaves until we reach target room count
        while (leaves.length < this.targetRooms) {
            // Find the best candidate to split (largest area)
            let bestIdx = -1;
            let maxArea = 0;

            for (let i = 0; i < leaves.length; i++) {
                const rect = leaves[i];
                // Check if splitable
                if (rect.w >= MIN_SIZE * 2 || rect.h >= MIN_SIZE * 2) {
                    const area = rect.w * rect.h;
                    if (area > maxArea) {
                        maxArea = area;
                        bestIdx = i;
                    }
                }
            }

            if (bestIdx === -1) {
                console.log("Cannot split further, reached room count:", leaves.length);
                break; // No splitable leaves left
            }

            // Split the best candidate
            const parent = leaves.splice(bestIdx, 1)[0];
            const rect = parent;

            // Determine split direction (prefer longest side)
            let splitH = Math.random() > 0.5;
            if (rect.w > rect.h * 1.5) splitH = false;
            else if (rect.h > rect.w * 1.5) splitH = true;

            // Determine split range
            const dim = splitH ? rect.h : rect.w;
            const max = dim - MIN_SIZE;
            const min = MIN_SIZE;

            // This shouldn't happen due to check above, but safety first
            if (max < min) {
                leaves.push(parent); // Put it back
                continue;
            }

            const splitPos = Math.floor(Math.random() * (max - min + 1)) + min;
            parent.splitH = splitH;
            parent.splitPos = splitPos;
            parent.leaf = false; // logic change: parent becomes a node, children are new leaves

            let rect1, rect2;
            if (splitH) { // Horizontal split
                rect1 = { x: rect.x, y: rect.y, w: rect.w, h: splitPos, leaf: true };
                rect2 = { x: rect.x, y: rect.y + splitPos, w: rect.w, h: rect.h - splitPos, leaf: true };
            } else { // Vertical split
                rect1 = { x: rect.x, y: rect.y, w: splitPos, h: rect.h, leaf: true };
                rect2 = { x: rect.x + splitPos, y: rect.y, w: rect.w - splitPos, h: rect.h, leaf: true };
            }

            parent.left = rect1;
            parent.right = rect2; // Store children on parent if we needed a tree, but here we just need leaves list for next iteration
            // Actually, for connectivity ("Connect Siblings"), we DO need the parent structure OR we need to remember the split.
            // My previous connectivity logic walked the tree.
            // So, I should maintain a list of LEAVES for splitting, AND a ROOT for traversal.

            // Refined approach:
            // Store splitting capability on the node.
            // Queue contains REFERENCES to leaf nodes in the tree.
            // When we split, we update the node in the tree to have children, and add children to queue.

            // Re-implementing correctly below.
            break; // Restart loop with better logic
        }

        // --- Correct Logic Implementation ---

        // Root of the BSP tree
        const root = { x: 0, y: 0, w: size, h: size, leaf: true };
        const splitQueue = [root]; // Nodes that are leaves and potential candidates

        while (splitQueue.length > 0 && this.countLeaves(root) < this.targetRooms) {
            // Pick largest
            let bestIdx = -1;
            let maxArea = 0;
            for (let i = 0; i < splitQueue.length; i++) {
                const node = splitQueue[i];
                if (node.w >= MIN_SIZE * 2 || node.h >= MIN_SIZE * 2) {
                    const area = node.w * node.h;
                    if (area > maxArea) {
                        maxArea = area;
                        bestIdx = i;
                    }
                }
            }

            if (bestIdx === -1) break; // No candidates

            const node = splitQueue.splice(bestIdx, 1)[0];

            // Split it
            let splitH = Math.random() > 0.5;
            if (node.w > node.h * 1.5) splitH = false;
            else if (node.h > node.w * 1.5) splitH = true;

            const dim = splitH ? node.h : node.w;
            const splitPos = Math.floor(Math.random() * (dim - MIN_SIZE * 2 + 1)) + MIN_SIZE; // Ensure children >= MIN_SIZE

            node.leaf = false;
            node.splitH = splitH;
            node.splitPos = splitPos;

            let rect1, rect2;
            if (splitH) {
                rect1 = { x: node.x, y: node.y, w: node.w, h: splitPos, leaf: true };
                rect2 = { x: node.x, y: node.y + splitPos, w: node.w, h: node.h - splitPos, leaf: true };
            } else {
                rect1 = { x: node.x, y: node.y, w: splitPos, h: node.h, leaf: true };
                rect2 = { x: node.x + splitPos, y: node.y, w: node.w - splitPos, h: node.h, leaf: true };
            }
            node.left = rect1;
            node.right = rect2;

            splitQueue.push(rect1, rect2);
        }

        // 1. Carve Rooms (Clear internal walls)
        // Helper
        function carve(node) {
            if (node.leaf) {
                // Clear internal horizontal walls
                for (let y = node.y + 1; y < node.y + node.h; y++) {
                    for (let x = node.x; x < node.x + node.w; x++) {
                        horizontalWalls[y][x] = false;
                    }
                }
                // Clear internal vertical walls
                for (let y = node.y; y < node.y + node.h; y++) {
                    for (let x = node.x + 1; x < node.x + node.w; x++) {
                        verticalWalls[y][x] = false;
                    }
                }
                return;
            }
            carve(node.left);
            carve(node.right);
        }
        carve(root);

        // 2. Connect Siblings
        function connect(node) {
            if (node.leaf) return;

            connect(node.left);
            connect(node.right);

            if (node.splitH) { // Horizontal split
                const wallY = node.y + node.splitPos;
                const startX = node.x;
                const width = node.w;
                const doorX = startX + Math.floor(Math.random() * (width - 2)) + 1;
                horizontalWalls[wallY][doorX] = false;
                if (width > 4 && Math.random() > 0.5) horizontalWalls[wallY][doorX + 1] = false;
            } else { // Vertical split
                const wallX = node.x + node.splitPos;
                const startY = node.y;
                const height = node.h;
                const doorY = startY + Math.floor(Math.random() * (height - 2)) + 1;
                verticalWalls[doorY][wallX] = false;
                if (height > 4 && Math.random() > 0.5) verticalWalls[doorY + 1][wallX] = false;
            }
        }
        connect(root);

        return { horizontalWalls, verticalWalls };
    }

    countLeaves(node) {
        if (node.leaf) return 1;
        return this.countLeaves(node.left) + this.countLeaves(node.right);
    }

    // Create doors at boundaries
    createContent(group, textureStyle, size) {
        const halfSize = (size * CELL_SIZE) / 2;
        const doorWidth = CELL_SIZE * 0.6;
        const doorHeight = WALL_HEIGHT * 0.85;
        const doorY = doorHeight / 2 - 0.5;

        const doorMaterial = new THREE.MeshBasicMaterial({
            color: textureStyle === 'entirewall' ? 0xffffff : 0x000000,
            side: THREE.DoubleSide
        });

        // Store door positions globally
        window.complexDoors = {
            north: { z: -halfSize, minX: -doorWidth / 2, maxX: doorWidth / 2 },
            south: { z: halfSize, minX: -doorWidth / 2, maxX: doorWidth / 2 },
            west: { x: -halfSize, minZ: -doorWidth / 2, maxZ: doorWidth / 2 },
            east: { x: halfSize, minZ: -doorWidth / 2, maxZ: doorWidth / 2 }
        };

        const northDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial.clone());
        northDoor.position.set(0, doorY, -halfSize + WALL_THICKNESS / 2 + 0.01);
        group.add(northDoor);

        const southDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial.clone());
        southDoor.position.set(0, doorY, halfSize - WALL_THICKNESS / 2 - 0.01);
        southDoor.rotation.y = Math.PI;
        group.add(southDoor);

        const westDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial.clone());
        westDoor.rotation.y = Math.PI / 2;
        westDoor.position.set(-halfSize + WALL_THICKNESS / 2 + 0.01, doorY, 0);
        group.add(westDoor);

        const eastDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial.clone());
        eastDoor.rotation.y = -Math.PI / 2;
        eastDoor.position.set(halfSize - WALL_THICKNESS / 2 - 0.01, doorY, 0);
        group.add(eastDoor);
    }

    getSceneSetup() {
        return {
            background: 0x000000,
            fog: null,
            ambientIntensity: 0.6
        };
    }

    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    handleWrapping(position, size) {
        const halfSize = (size * CELL_SIZE) / 2;

        let exitDirection = null;
        if (position.x < -halfSize) exitDirection = 'west';
        else if (position.x > halfSize) exitDirection = 'east';
        else if (position.z < -halfSize) exitDirection = 'north';
        else if (position.z > halfSize) exitDirection = 'south';

        if (exitDirection && typeof handleComplexDoorCrossing === 'function') {
            handleComplexDoorCrossing(exitDirection);
        }
        return position;
    }

    isDoorWall(type, x, y, size) {
        const center = Math.floor(size / 2);
        if (type === 'horizontal' && y === 0 && x === center) return true;
        if (type === 'horizontal' && y === size && x === center) return true;
        if (type === 'vertical' && x === 0 && y === center) return true;
        if (type === 'vertical' && x === size && y === center) return true;
        return false;
    }

    showMinimap() {
        return true;
    }

    getEffectiveSize() {
        return 25; // Default to 20 per user request
    }
}

registerScene('complex', new ComplexScene());
