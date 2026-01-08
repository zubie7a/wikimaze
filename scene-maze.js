// Maze Scene Controller
// Standard maze with recursive backtracking generation

class MazeScene extends SceneController {
    constructor() {
        super('maze');
    }

    // Generate maze layout using recursive backtracking
    generateLayout(size) {
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(true));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(true));

        // Mark outer boundaries
        for (let x = 0; x < size; x++) {
            horizontalWalls[0][x] = true;
            horizontalWalls[size][x] = true;
        }
        for (let y = 0; y < size; y++) {
            verticalWalls[y][0] = true;
            verticalWalls[y][size] = true;
        }

        // Track visited cells
        const visited = Array(size).fill(null).map(() => Array(size).fill(false));

        // Recursive backtracking to carve paths
        function carve(x, y) {
            visited[y][x] = true;

            const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

            // Shuffle directions
            for (let i = directions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [directions[i], directions[j]] = [directions[j], directions[i]];
            }

            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx]) {
                    if (dx === 0) {
                        const wallY = dy === -1 ? y : y + 1;
                        horizontalWalls[wallY][x] = false;
                    } else {
                        const wallX = dx === -1 ? x : x + 1;
                        verticalWalls[y][wallX] = false;
                    }
                    carve(nx, ny);
                }
            }
        }

        carve(0, 0);

        // Connect any isolated cells
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (!visited[y][x]) {
                    if (x > 0 && visited[y][x - 1]) {
                        verticalWalls[y][x] = false;
                        carve(x, y);
                    } else if (x < size - 1 && visited[y][x + 1]) {
                        verticalWalls[y][x + 1] = false;
                        carve(x, y);
                    } else if (y > 0 && visited[y - 1][x]) {
                        horizontalWalls[y][x] = false;
                        carve(x, y);
                    } else if (y < size - 1 && visited[y + 1][x]) {
                        horizontalWalls[y + 1][x] = false;
                        carve(x, y);
                    }
                }
            }
        }

        // Remove some walls to create more open spaces
        const openSpaceChance = 0.3;
        for (let y = 1; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (Math.random() < openSpaceChance) {
                    horizontalWalls[y][x] = false;
                }
            }
        }
        for (let y = 0; y < size; y++) {
            for (let x = 1; x < size; x++) {
                if (Math.random() < openSpaceChance) {
                    verticalWalls[y][x] = false;
                }
            }
        }

        // Create doors on boundary walls (one per side at random positions)
        // NOTE: We do NOT remove the walls - the door is a visual overlay only
        // Collision detection for door passage is handled in maze.js

        // North door: horizontal wall at y=0, random x
        const northDoorX = Math.floor(Math.random() * size);

        // South door: horizontal wall at y=size, random x
        const southDoorX = Math.floor(Math.random() * size);

        // West door: vertical wall at x=0, random y
        const westDoorY = Math.floor(Math.random() * size);

        // East door: vertical wall at x=size, random y
        const eastDoorY = Math.floor(Math.random() * size);

        // Store door positions for collision detection and visual rendering
        window.mazeDoors = {
            north: { x: northDoorX, y: 0, direction: 'north' },
            south: { x: southDoorX, y: size, direction: 'south' },
            west: { x: 0, y: westDoorY, direction: 'west' },
            east: { x: size, y: eastDoorY, direction: 'east' },
            size: size,
            doorWidth: CELL_SIZE * 0.6,
            doorHeight: WALL_HEIGHT * 0.85
        };

        return { horizontalWalls, verticalWalls };
    }

    // Create visual door representations on boundary walls
    createContent(group, textureStyle, size) {
        const doors = window.mazeDoors;
        if (!doors) return;

        const doorWidth = doors.doorWidth;
        const doorHeight = doors.doorHeight;
        const doorY = doorHeight / 2 - 0.5;
        const doorMaterial = new THREE.MeshBasicMaterial({
            color: textureStyle === 'entirewall' ? 0xffffff : 0x000000,
            side: THREE.DoubleSide
        });

        // North door (horizontal wall at y=0) - wall faces south, door should be inside
        const northDoorGeom = new THREE.PlaneGeometry(doorWidth, doorHeight);
        const northDoor = new THREE.Mesh(northDoorGeom, doorMaterial.clone());
        const northX = (doors.north.x - size / 2) * CELL_SIZE + CELL_SIZE / 2;
        const northZ = (-size / 2) * CELL_SIZE;
        northDoor.position.set(northX, doorY, northZ + WALL_THICKNESS / 2 + 0.01);
        northDoor.rotation.y = 0; // Face south (into maze)
        group.add(northDoor);

        // South door (horizontal wall at y=size) - wall faces north, door should be inside
        const southDoorGeom = new THREE.PlaneGeometry(doorWidth, doorHeight);
        const southDoor = new THREE.Mesh(southDoorGeom, doorMaterial.clone());
        const southX = (doors.south.x - size / 2) * CELL_SIZE + CELL_SIZE / 2;
        const southZ = (size / 2) * CELL_SIZE;
        southDoor.position.set(southX, doorY, southZ - WALL_THICKNESS / 2 - 0.01);
        southDoor.rotation.y = Math.PI; // Face north (into maze)
        group.add(southDoor);

        // West door (vertical wall at x=0) - wall faces east, door should be inside
        const westDoorGeom = new THREE.PlaneGeometry(doorWidth, doorHeight);
        const westDoor = new THREE.Mesh(westDoorGeom, doorMaterial.clone());
        const westX = (-size / 2) * CELL_SIZE;
        const westZ = (doors.west.y - size / 2) * CELL_SIZE + CELL_SIZE / 2;
        westDoor.position.set(westX + WALL_THICKNESS / 2 + 0.01, doorY, westZ);
        westDoor.rotation.y = Math.PI / 2; // Face east (into maze)
        group.add(westDoor);

        // East door (vertical wall at x=size) - wall faces west, door should be inside
        const eastDoorGeom = new THREE.PlaneGeometry(doorWidth, doorHeight);
        const eastDoor = new THREE.Mesh(eastDoorGeom, doorMaterial.clone());
        const eastX = (size / 2) * CELL_SIZE;
        const eastZ = (doors.east.y - size / 2) * CELL_SIZE + CELL_SIZE / 2;
        eastDoor.position.set(eastX - WALL_THICKNESS / 2 - 0.01, doorY, eastZ);
        eastDoor.rotation.y = -Math.PI / 2; // Face west (into maze)
        group.add(eastDoor);
    }

    // Black void background, no fog
    getSceneSetup() {
        return {
            background: 0x000000, // Black
            fog: null,
            ambientIntensity: 0.6
        };
    }

    // Start near the west door
    getStartPosition(size) {
        const doors = window.mazeDoors;
        if (doors) {
            // Spawn just inside the west door, facing east
            const westDoorZ = (doors.west.y - size / 2) * CELL_SIZE + CELL_SIZE / 2;
            return {
                x: (-size / 2) * CELL_SIZE + CELL_SIZE / 2,
                z: westDoorZ,
                rotation: -Math.PI / 2 // Face east (into maze)
            };
        }
        // Fallback to corner
        return {
            x: (-size / 2) * CELL_SIZE + CELL_SIZE / 2,
            z: (-size / 2) * CELL_SIZE + CELL_SIZE / 2,
            rotation: 0
        };
    }
}

// Register the maze scene
registerScene('maze', new MazeScene());
