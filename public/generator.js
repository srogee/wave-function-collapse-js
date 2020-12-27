WFC = {};

WFC.TiledModel = class TiledModel {
    // Sets up the generator parameters and propagates initial constraints
    constructor(modules, edgeTypes, dimensions, onCellResolve, randomStream) {
        this.edgeTypes = edgeTypes;
        var domain = [];

        // Generate rotated variants of each module
        for (var module of modules) {
            for (var rotation of WFC.ModuleRotation.values) {
                domain.push(new WFC.ModuleConfiguration(module, this, rotation));
            }
        }

        this.grid = new Map();
        this.dimensions = dimensions;
        this.cellPropagationStack = [];
        this.onCellResolve = onCellResolve;
        this.state = WFC.GeneratorState.Running;

        for (var x = 0; x < dimensions.x; x++) {
            for (var y = 0; y < dimensions.y; y++) {
                for (var z = 0; z < dimensions.z; z++) {
                    var location = new WFC.Vector3(x, y, z);
                    var cell = new WFC.GridCell(location, domain, this);
                    this.setCellAt(location, cell);
                    this.addCellToConstraintPropagationStack(location);
                }
            }
        }

        // We need to propagate here otherwise we could pick a cell on the edge of the grid and accidentally give it
        // an invalid domain (e.g. have an edge that connects to nothing)
        this.propagate();

        this.defaultDomain = domain;
    }

    // Gets the cell at the specified location
    getCellAt(location) {
        return this.grid.get(WFC.Utils.convertVectorToKey(location));
    }

    // Sets the cell at the specified location
    setCellAt(location, value) {
        this.grid.set(WFC.Utils.convertVectorToKey(location), value);
    }

    // Pick a cell and resolve it (i.e. pick a valid module in its domain, and remove all other modules from its domain)
    observe() {
        if (this.state === WFC.GeneratorState.Running) {
            var cell = this.getCellWithLowestEntropy();
            if (cell) {
                cell.resolve();
            } else {
                this.state = WFC.GeneratorState.Done;
            }
        }
    }

    // Propagate adjaceny constraints to all potentially affected cells
    propagate() {
        while (this.cellPropagationStack.length > 0 && this.state === WFC.GeneratorState.Running) {
            var cell = this.cellPropagationStack.pop();
            if (cell) {
                cell.filterDomain();
            }
        }
    }

    // Adds the cell at the specified location to the stack of cells to propagate constraints for
    addCellToConstraintPropagationStack(location) {
        var cell = this.getCellAt(location);
        if (cell && cell.state === WFC.CellState.Unresolved) {
            this.cellPropagationStack.push(cell);
        }
    }

    // Find the unresolved cell with the lowest entropy. Why do we want this?
    // 1. it’s likely to be near other filled cells
    // 2. if we leave it until later, it could be trouble as there are already few possibilities
    getCellWithLowestEntropy() {
        var cells = [...this.grid.values()];
        cells = cells.filter(cell => cell.state === WFC.CellState.Unresolved);
        return WFC.Utils.getMinimumByPredicate(cells, cell => cell.getEntropy());
    }
}

WFC.GeneratorExtensions = class GeneratorExtensions {
    constructor(generator) {
        this.generator = generator;
        this.floodFillResults = new Map();
    }

    performFloodFillForRegionPruning(location, value) {
        var locationKey = WFC.Utils.convertVectorToKey(location);
        if (!this.floodFillResults.has(locationKey)) {
            this.floodFillResults.set(locationKey, value);
            var queue = [ location ];
            while (queue.length > 0) {
                var currentLocation = queue.splice(0, 1)[0];
                var cell = this.generator.getCellAt(currentLocation);

                if (cell) {
                    for (var dir of WFC.EdgeDirection.values) {
                        var edgeType = cell.domain?.[0]?.getEdgeType(dir);
                        if (edgeType) {
                            var neighborLocation = WFC.Vector3.add(currentLocation, WFC.EdgeDirection.toDirectionVector(dir));
                            locationKey = WFC.Utils.convertVectorToKey(neighborLocation);
                            if (!this.floodFillResults.has(locationKey)) {
                                this.floodFillResults.set(locationKey, value);
                                queue.push(neighborLocation)
                            } 
                        }
                    }
                }
            }
        }

        var region = [...this.floodFillResults.entries()].filter(entry => entry[1] === value).map(entry => WFC.Utils.convertKeyToVector(entry[0]));
        return region.length > 0 ? region : null;
        /*
        Flood-fill (node, target-color, replacement-color):
        1. If target-color is equal to replacement-color, return.
        2. If color of node is not equal to target-color, return.
        3. Set the color of node to replacement-color.
        4. Set Q to the empty queue.
        5. Add node to the end of Q.
        6. While Q is not empty:
        7.     Set n equal to the first element of Q.
        8.     Remove first element from Q.
        9.     If the color of the node to the west of n is target-color,
                    set the color of that node to replacement-color and add that node to the end of Q.
        10.     If the color of the node to the east of n is target-color,
                    set the color of that node to replacement-color and add that node to the end of Q.
        11.     If the color of the node to the north of n is target-color,
                    set the color of that node to replacement-color and add that node to the end of Q.
        12.     If the color of the node to the south of n is target-color,
                    set the color of that node to replacement-color and add that node to the end of Q.
        13. Continue looping until Q is exhausted.
        14. Return.
        */
    }
}

// Class for each cell in a tiled model generator grid
WFC.GridCell = class GridCell {
    constructor(location, domain, generator) {
        this.location = location;
        this.domain = _.clone(domain);
        this.generator = generator;
        this.state = WFC.CellState.Unresolved;
    }

    // Gets the world location for this cell for use when debug drawing. Centers the grid
    getAdjustedLocation() {
        return WFC.Vector3.add(WFC.Vector3.subtract(this.location, WFC.Vector3.divide(this.generator.dimensions, 2)), 0.5);
    }

    // Resolve this cell's domain (i.e. pick a valid module in it and remove all other modules)
    resolve() {
        if (this.state === WFC.CellState.Unresolved) {
            if (this.domain.length > 0) {
                var choices = this.domain.map(config => {
                    return {
                        value: config, weight: config.getWeight()
                    };
                });
                var choice = WFC.Utils.pickWeightedRandom(choices);
                this.resolveToSpecificConfig(choice);
            }

            if (this.state !== WFC.CellState.Resolved) {
                this.state = WFC.CellState.Conflicted;
                this.generator.state = WFC.GeneratorState.Conflicted;
            }
        }
    }

    resolveToSpecificConfig(config) {
        if (config) {
            this.state = WFC.CellState.Resolved;
            this.domain = [ config ];
            if (this.generator.onCellResolve) {
                this.generator.onCellResolve(this);
            }
            this.flagNeighborsForConstraintUpdates();
        }
    }

    // Signal the generator that it should update constraints for this cell's neighbors the next time we propagate constraints
    flagNeighborsForConstraintUpdates() {
        for (var dir of WFC.EdgeDirection.values) {
            var neighborLocation = WFC.Vector3.add(this.location, WFC.EdgeDirection.toDirectionVector(dir));
            this.generator.addCellToConstraintPropagationStack(neighborLocation);
        }
    }

    // Calculate the entropy of this cell
    getEntropy() {
        var sum = 0;
        for (var config of this.domain) {
            var weight = config.getWeight();
            sum += weight * Math.log(weight);
        }
        return -sum;
    }

    // Filter the domain of this cell based on adjacency constraints
    filterDomain() {
        if (this.state === WFC.CellState.Unresolved) {
            var filtered = this.domain.filter(config => this.isModuleOkay(config));

            if (!_.isEqual(this.domain, filtered)) {
                this.domain = filtered;
                if (this.domain.length === 0) {
                    // We can't possibly complete generation now, so just stop it
                    this.state = WFC.CellState.Conflicted;
                    this.generator.state = WFC.GeneratorState.Conflicted;
                } else {
                    // Something actually changed, let's recalculate the domains for our neighbors
                    this.flagNeighborsForConstraintUpdates();
                }
            }
        }
    }

    // Checks if a specific module in our domain is okay to place
    isModuleOkay(config) {
        var okay = true;

        for (var outgoingDirection of WFC.EdgeDirection.values) {
            var neighborLocation = WFC.Vector3.add(this.location, WFC.EdgeDirection.toDirectionVector(outgoingDirection));
            var neighbor = this.generator.getCellAt(neighborLocation);
            if (neighbor) {
                okay = neighbor.domain.some(neighborConfig => this.areModulesOkay(outgoingDirection, config, neighborConfig));
            } else {
                okay = this.areModulesOkay(outgoingDirection, config, null);
            }

            // All directions have to be okay. If one isn't, just quit early
            if (!okay) {
                break;
            }
        }

        return okay;
    }

    // Checks if a specific module in our domain, and a specific module in a neighbor's domain, can be placed next to each other
    areModulesOkay(outgoingDirection, a, b) {
        var outgoingEdgeType = a.getEdgeType(outgoingDirection);
        if (!b) {
            return !outgoingEdgeType || outgoingEdgeType.canConnectToGridEdge; // If no adjacent module, it's okay if we don't have an outgoing edge. Otherwise the edge will go nowhere
        }

        var incomingEdgeType = b.getEdgeType(WFC.EdgeDirection.getOppositeDirection(outgoingDirection));
        return outgoingEdgeType === incomingEdgeType; // These modules have the same edge type, we can place them next to each other
    }
}

// Class representing a configuration of a module (e.g. rotated). This is what goes in the domain of a cell
WFC.ModuleConfiguration = class ModuleConfiguration {
    constructor(definition, generator, rotation) {
        this.definition = definition;
        this.generator = generator;
        this.rotation = rotation;
    }

    // Get the weight of this configuration. Since each configuration is repeated 4 times (4 rotations)
    // we should divide the weight by 4
    getWeight() {
        return this.definition.weight / 4;
    }

    // Gets the type of edge in the given direction. The type is an object with a name and debug color
    getEdgeType(edgeDirection) {
        // Given this module's rotation, figure out if there is an edge in the specified direction and
        // what kind of edge it is.
        var actualDirection = WFC.EdgeDirection.unrotateDirection(edgeDirection, this.rotation);
        var edgeTypeName = this.definition?.edgeTypes?.[actualDirection];
        if (edgeTypeName) {
            return this.generator.edgeTypes.find(edgeType => edgeType.name === edgeTypeName);
        }
        return null;
    }

    hasNoEdges() {
        var edgeTypes = this.definition?.edgeTypes;
        if (edgeTypes && Object.getOwnPropertyNames(edgeTypes).length > 0) {
            return false;
        }

        return true;
    }
}

// Simple vector class
WFC.Vector3 = class Vector3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    // Return a new vector with the same values as the one passed in
    static copy(vector) {
        return new Vector3(vector.x, vector.y, vector.z);
    }

    // Return a new vector with a added to b. a is a vector, b can be a scalar or a vector
    add(other) {
        return Vector3.add(this, other);
    }

    // Return a new vector with a added to b. a is a vector, b can be a scalar or a vector
    static add(a, b) {
        if (WFC.Utils.isNumber(b)) {
            return new Vector3(a.x + b, a.y + b, a.z + b);
        }
        return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    // Return a new vector with b subtracted from a. a is a vector, b can be a scalar or a vector
    subtract(other) {
        return Vector3.subtract(this, other);
    }

    // Return a new vector with b subtracted from a. a is a vector, b can be a scalar or a vector
    static subtract(a, b) {
        if (WFC.Utils.isNumber(b)) {
            return new Vector3(a.x - b, a.y - b, a.z - b);
        }
        return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    // Return a new vector with a multiplied by b. a is a vector, b can be a scalar or a vector
    multiply(other) {
        return Vector3.multiply(this, other);
    }

    // Return a new vector with a multiplied by b. a is a vector, b can be a scalar or a vector
    static multiply(a, b) {
        if (WFC.Utils.isNumber(b)) {
            return new Vector3(a.x * b, a.y * b, a.z * b);
        }
        return new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
    }

    // Return a new vector with a divided by b. a is a vector, b can be a scalar or a vector
    divide(other) {
        return Vector3.divide(this, other);
    }

    // Return a new vector with a divided by b. a is a vector, b can be a scalar or a vector
    static divide(a, b) {
        if (WFC.Utils.isNumber(b)) {
            return new Vector3(a.x / b, a.y / b, a.z / b);
        }
        return new Vector3(a.x / b.x, a.y / b.y, a.z / b.z);
    }

    toString() {
        return `(${this.x}, ${this.y}, ${this.z})`;
    }
}

// Various utility functions
WFC.Utils = class Utils {
    // Checks if the value is a number or not
    static isNumber(value) {
        return typeof(value) == 'number' && !isNaN(value) && isFinite(value);
    }

    // Converts a vector to a string representation for use as a map key (since two vectors with the same values are not considered
    // equal by Maps)
    static convertVectorToKey(vector) {
        return JSON.stringify(vector);
    }

    // Converts a string representation of a vector to a new vector
    static convertKeyToVector(key) {
        var value = JSON.parse(key);
        return new WFC.Vector3(value.x, value.y, value.z);
    }

    // Gets the array element with the smallest value by the specified predicate function
    static getMinimumByPredicate(array, predicate) {
        var index = -1;
        var smallestValue = null;

        for (var i = 0; i < array.length; i++) {
            var value = predicate(array[i], i, array);
            if (value < smallestValue || smallestValue === null) {
                index = i;
                smallestValue = value;
            }
        }

        if (index < 0) {
            return null;
        }

        return array[index];
    }

    // Gets the array element with the largest value by the specified predicate function
    static getMaximumByPredicate(array, predicate) {
        var index = -1;
        var largestValue = null;

        for (var i = 0; i < array.length; i++) {
            var value = predicate(array[i], i, array);
            if (value > largestValue || largestValue === null) {
                index = i;
                largestValue = value;
            }
        }

        if (index < 0) {
            return null;
        }

        return array[index];
    }

    // Pick from an array of choices with weights. Expects each choice to be in the format
    // { value, weight }
    static pickWeightedRandom(choices) {
        var index = -1;
        var totalWeight = 0;

        for (var choice of choices) {
            totalWeight += choice.weight;
        }

        if (totalWeight <= 0) {
            return null;
        }

        var sample = randomStream() * totalWeight;
        var previousWeight = 0;
        var nextWeight = 0;
        for (var i = 0; i < choices.length; i++) {
            nextWeight = previousWeight + choices[i].weight;
            if (sample >= previousWeight && sample < nextWeight) {
                index = i;
                break;
            }
            previousWeight = nextWeight;
        }

        if (index < 0) {
            return null;
        }

        return choices[index].value;
    }

    static degreesToRadians(degrees) {
        return degrees * Math.PI / 180;
    }
}

// Enum for the state of a grid cell
WFC.CellState = class CellState {
    static Unresolved = "Unresolved";
    static Resolved = "Resolved";
    static Conflicted = "Conflicted";
}

// Enum for the state of a generator
WFC.GeneratorState = class GeneratorState {
    static Running = "Running";
    static Done = "Done";
    static Conflicted = "Conflicted";
}

// Enum for the rotation of a module
WFC.ModuleRotation = class ModuleRotation {
    static Z0 = "Z0";
    static Z90 = "Z90";
    static Z180 = "Z180";
    static Z270 = "Z270";

    static values = [
        ModuleRotation.Z0,
        ModuleRotation.Z90,
        ModuleRotation.Z180,
        ModuleRotation.Z270
    ]

    // Invert this rotation (i.e. what rotation do we need to get back to identity)
    static getInverseRotation(rotation) {
        switch (rotation) {
            case WFC.ModuleRotation.Z0:
                return WFC.ModuleRotation.Z0;
            case WFC.ModuleRotation.Z90:
                return WFC.ModuleRotation.Z270;
            case WFC.ModuleRotation.Z180:
                return WFC.ModuleRotation.Z180;
            case WFC.ModuleRotation.Z270:
                return WFC.ModuleRotation.Z90;
        }

        return null;
    }

    static getLocalRotation(rotation, offset) {
        offset = offset || 0;
        switch (rotation) {
            case WFC.ModuleRotation.Z0:
                return new THREE.Euler(0, 0, WFC.Utils.degreesToRadians(offset));
            case WFC.ModuleRotation.Z90:
                return new THREE.Euler(0, 0, WFC.Utils.degreesToRadians(90 + offset))
            case WFC.ModuleRotation.Z180:
                return new THREE.Euler(0, 0, WFC.Utils.degreesToRadians(180 + offset));
            case WFC.ModuleRotation.Z270:
                return new THREE.Euler(0, 0, WFC.Utils.degreesToRadians(270 + offset));
        }

        return null;
    }
}

// Enum for outgoing edge direction
WFC.EdgeDirection = class EdgeDirection {
    static XPositive = "+X";
    static YPositive = "+Y";
    static ZPositive = "+Z";
    static XNegative = "-X";
    static YNegative = "-Y";
    static ZNegative = "-Z";

    // List of values in the enum
    static values = [
        EdgeDirection.XPositive,
        EdgeDirection.YPositive,
        EdgeDirection.ZPositive,
        EdgeDirection.XNegative,
        EdgeDirection.YNegative,
        EdgeDirection.ZNegative
    ];

    // List of values on the XY axes
    static horizontalValues = [
        EdgeDirection.XPositive,
        EdgeDirection.YPositive,
        EdgeDirection.XNegative,
        EdgeDirection.YNegative,
    ]

    // Transforms the specified direction by the specified rotation
    static rotateDirection(direction, rotation) {
        var directionIndex = WFC.EdgeDirection.horizontalValues.indexOf(direction);
        if (directionIndex >= 0) {
            var rotationIndex = WFC.ModuleRotation.values.indexOf(rotation);
            if (rotationIndex >= 0) {
                return WFC.EdgeDirection.horizontalValues[(directionIndex + rotationIndex) % WFC.EdgeDirection.horizontalValues.length];
            }
        }

        return null;
    }

    // Un-transforms the specified direction by the specified rotation
    static unrotateDirection(direction, rotation) {
        var inverseRotation = WFC.ModuleRotation.getInverseRotation(rotation);
        return WFC.EdgeDirection.rotateDirection(direction, inverseRotation);
    }

    // Given a direction from this enum, return the world direction vector corresponding to it
    static toDirectionVector(value) {
        switch (value) {
            case WFC.EdgeDirection.XPositive:
                return new WFC.Vector3(1, 0, 0);
            case WFC.EdgeDirection.YPositive:
                return new WFC.Vector3(0, 1, 0);
            case WFC.EdgeDirection.ZPositive:
                return new WFC.Vector3(0, 0, 1);
            case WFC.EdgeDirection.XNegative:
                return new WFC.Vector3(-1, 0, 0);
            case WFC.EdgeDirection.YNegative:
                return new WFC.Vector3(0, -1, 0);
            case WFC.EdgeDirection.ZNegative:
                return new WFC.Vector3(0, 0, -1);
        }

        return null;
    }

    // Given a direction from this enum, return the opposite direction (as if you negated it)
    static getOppositeDirection(value) {
        var index = WFC.EdgeDirection.values.indexOf(value);
        if (index >= 0) {
            return WFC.EdgeDirection.values[(index + 3) % WFC.EdgeDirection.values.length];
        }

        return null;
    }
}