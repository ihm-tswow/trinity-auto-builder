const fs = require('fs');

if(fs.existsSync('./build')) {
    fs.rmSync('./build', {recursive: true})
}

if(fs.existsSync('./install')) {
    fs.rmSync('./install', {recursive: true})
}