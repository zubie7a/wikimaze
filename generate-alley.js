// Alley layout generator - single corridor with wrapping
function generateAlleyLayout(size) {
    // Start with no walls
    const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
    const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));
    
    // Create a single alley in the middle row
    const alleyZ = Math.floor(size / 2);
    
    // Add walls on north side of alley
    for (let x = 0; x < size; x++) {
        horizontalWalls[alleyZ][x] = true;
    }
    
    // Add walls on south side of alley
    for (let x = 0; x < size; x++) {
        horizontalWalls[alleyZ + 1][x] = true;
    }
    
    // No east/west boundaries - allows wrapping
    
    return { horizontalWalls, verticalWalls };
}

