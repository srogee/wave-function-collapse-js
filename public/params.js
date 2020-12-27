class ParamLoader {
    constructor() {
        this.data = [];
        this.values = new Map();
    }

    loadParameter(name, type, defaultValue, minValue, maxValue) {
        if (!this.data.some(params => params.name === name)) {
            this.data.push({
                name,
                type
            });
        }

        var value = this.parseParameter(name, type);

        if (minValue !== null && value < minValue) {
            value = null;
        } else if (maxValue !== null && value > maxValue) {
            value = null;
        }

        if (value !== null) {
            console.log(`Setting "${name}" to parsed value "${value}"`);
            this.values.set(name, value);
        } else {
            console.log(`Setting "${name}" to default value "${defaultValue}"`);
            this.values.set(name, defaultValue);
        }
        
        return value;
    }

    aliasParameter(name, value) {
        console.log(`Setting "${name}" to aliased value "${value}"`);
        this.values.set(name, value);
    }

    parseParameter(name, type) {
        var url = window.location.search;
        var urlParams = new URLSearchParams(url);
        var value = urlParams.get(name);

        switch (type) {
            case ParamType.Float:
                return this.parseFloatParameter(value);
            case ParamType.Integer:
                return this.parseIntegerParameter(value);
            case ParamType.Boolean:
                return this.parseBooleanParameter(value);
        }

        return null;
    }

    parseFloatParameter(value) {
        var parsedValue = parseFloat(value);
        if (!isNaN(parsedValue) && isFinite(parsedValue)) {
            return parsedValue;
        } else {
            return null;
        }
    }

    parseIntegerParameter(value) {
        var parsedValue = parseInt(value, 10);
        if (!isNaN(parsedValue) && isFinite(parsedValue)) {
            return parsedValue;
        } else {
            return null;
        }
    }

    parseBooleanParameter(value) {
        if (value === 'true' || value == 1) {
            return true;
        } else if (value === 'false' || value == 0) {
            return false;
        }

        return null;
    }

    getParameterValue(name) {
        return this.values.get(name);
    }
}

class ParamType {
    static Float = 0;
    static Boolean = 1;
    static Integer = 2;
}