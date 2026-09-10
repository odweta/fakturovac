const express = require('express');
const path = require('path');

const app = express();

// specifying the folder with the static content - html+css
app.use(express.static(__dirname + '/static'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/static/index.html'));
});

module.exports = app;