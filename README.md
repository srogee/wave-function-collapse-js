# Wave Function Collapse in JS
A simple JS implementation of the Wave Function Collapse algorithm.

## Try it
You can try this in the browser [here](https://wave-function-collapse.herokuapp.com/), or clone the repository and run it yourself:
1. Install [Node.js](https://nodejs.org/en/)
2. Clone this repository
3. In the cloned repository folder, open a command prompt or PowerShell prompt and type `npm install` to install dependencies
4. Type `npm start` to run the webserver
5. Open a browser and type `localhost:3000` into the URL bar

## Parameters
The following parameters are supported. Just add them to the end of the URL (example: `https://wave-function-collapse.herokuapp.com/?lagTime=50&seed=1&enableDebugLines=true`)
- `seed` (integer): The seed controlling the output of the algorithm. Default is a random integer.
- `xSize` (integer): The size of the grid along the X axis. Default is `25`.
- `ySize` (integer): The size of the grid along the Y axis. Default is `25`.
- `lagTime` (float): The time in milliseconds we should wait between algorithm iterations. Default is `0`.
- `enableDebugLines` (boolean): If we should show grid lines/edge colors. Default is `false`.
- `pruneSmallerRegions` (boolean): If we should flood fill to find the different regions in the grid, and remove all but the largest region. Default is `true`.


## How it works
This is a tiled model implementation, i.e. there are tiles that have adjacency constraints and the algorithm tries to place tiles such that those constraints are met. The algorithm itself is pretty straightforward:

1. Initialize each grid cell's domain to the list of all possible tiles and their rotated variants.
2. Filter all cells' domains based on constraints (for example, in this implementation, tiles cannot have connections that are adjacent to an edge of the grid).
3. Pick the cell with the lowest entropy. Choose a tile from its domain based on tile weights and set its domain to only include that tile.
4. Filter relevant cells' domains to only include tiles that meet adjacency constraints based on the tiles in the neighboring cells' domains.
5. Repeat steps 3 and 4 until every grid cell has only one tile in its domain (or there is a contradiction, i.e. one or more grid cells have no tiles in their domains).

## Example output
![Preview](meta/preview2.png)
