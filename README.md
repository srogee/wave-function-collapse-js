# Wave Function Collapse in JS
A simple JS implementation of the Wave Function Collapse algorithm. You can try this in your browser [here](https://wave-function-collapse.herokuapp.com/).

## Example output
![Preview](meta/preview.png)

## How it works
This is a tiled model implementation, i.e. there are tiles that have adjacency constraints and the algorithm tries to place tiles such that those constraints are met. The algorithm itself is pretty straightforward:

1. Initialize each grid cell's domain to the list of all possible tiles and their rotated variants.
2. Filter all cells' domains based on constraints (for example, in this implementation, tiles cannot have connections that are adjacent to an edge of the grid).
3. Pick the cell with the lowest entropy. Choose a tile from its domain based on tile weights and set its domain to only include that tile.
4. Filter relevant cells' domains to only include tiles that meet adjacency constraints based on the tiles in the neighboring cells' domains.
5. Repeat steps 3 and 4 until every grid cell has only one tile in its domain (or there is a contradiction, i.e. one or more grid cells have no tiles in their domains).
