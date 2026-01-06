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

        return { horizontalWalls, verticalWalls };
    }

    // Maze has no special content beyond walls
    createContent(group, textureStyle, size) {
        // Standard maze has no additional scene objects
    }

    // Blue sky background, no fog
    getSceneSetup() {
        return {
            background: 0x87CEEB, // Sky blue
            fog: null,
            ambientIntensity: 0.6
        };
    }

    // Start in corner of maze
    getStartPosition(size) {
        return {
            x: (-size / 2) * CELL_SIZE + CELL_SIZE / 2,
            z: (-size / 2) * CELL_SIZE + CELL_SIZE / 2,
            rotation: 0
        };
    }
}

// Register the maze scene
registerScene('maze', new MazeScene());
