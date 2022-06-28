/**
 * Use this script to test production build locally:
 * node serve-public.js
 */

var express = require('express');
var app = express();
var path = require('path');

app.use(express.static(path.join(__dirname, 'build')));

app.listen(4000);
console.log('Listening on port 4000');
