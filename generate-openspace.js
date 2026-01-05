// Open space layout generator - empty room with boundary walls only
function generateOpenspaceLayout(size) {
    // Start with no internal walls, only boundaries
    const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
    const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));
    
    // Add boundary walls
    for (let x = 0; x < size; x++) {
        horizontalWalls[0][x] = true;      // North boundary
        horizontalWalls[size][x] = true;   // South boundary
    }
    for (let y = 0; y < size; y++) {
        verticalWalls[y][0] = true;        // West boundary
        verticalWalls[y][size] = true;     // East boundary
    }
    
    return { horizontalWalls, verticalWalls };
}

