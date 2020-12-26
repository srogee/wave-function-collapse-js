// Just a simple web server that serves up anything in the ./public directory
// Used for loading JSON from external files without needing to fuck with browser settings
const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});